"""Endpoint del módulo de Transporte (`POST /transport/solve`).

Pipeline completo: balancea el problema, calcula las tres soluciones iniciales
(Noroeste/Costo Mínimo/Vogel) para comparar, optimiza con MODI la elegida por
el usuario (genera el detalle paso a paso), y por separado recalcula la
respuesta *oficial* (asignaciones, costo total y análisis de sensibilidad) con
PuLP, por robustez ante casos degenerados."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import pulp
import re

from app.algorithms.steps import SolutionStep
from app.algorithms.transport.utils import balance_transport_problem
from app.algorithms.transport.northwest import northwest_corner
from app.algorithms.transport.min_cost import min_cost
from app.algorithms.transport.vogel import vogel
from app.algorithms.transport.modi import modi_optimize

router = APIRouter()


def _pulp_safe_name(name: str) -> str:
    """PuLP sanea internamente espacios/caracteres inválidos en nombres de restricciones
    (ej. 'Supply_Nueva York' -> 'Supply_Nueva_York'). Saneamos nosotros mismos el nombre
    al crearlo para poder volver a buscarlo en prob.constraints[...] sin KeyError."""
    return re.sub(r'[^A-Za-z0-9_]', '_', name)

INITIAL_METHODS = {
    "noroeste": northwest_corner,
    "costo_minimo": min_cost,
    "vogel": vogel,
}

class TransportProblemInput(BaseModel):
    origins: List[str]      # e.g., ["S1", "S2", "S3"]
    destinations: List[str]  # e.g., ["D1", "D2", "D3", "D4"]
    supply: List[float]      # e.g., [180, 240, 160]
    demand: List[float]      # e.g., [140, 160, 120, 160]
    costs: List[List[float]] # Cost matrix, size len(origins) x len(destinations)
    initial_method: Optional[str] = "vogel"  # "noroeste", "costo_minimo", "vogel"

class RouteAllocation(BaseModel):
    origin: str
    destination: str
    units: float
    cost: float

class TransportMethodResult(BaseModel):
    method: str
    total_cost: float
    allocations: List[RouteAllocation]

class ConstraintDual(BaseModel):
    name: str
    shadow_price: float
    slack: float

class RouteSensitivity(BaseModel):
    origin: str
    destination: str
    opportunity_cost: float

class TransportSolutionOutput(BaseModel):
    status: str
    total_cost: float
    allocations: List[RouteAllocation]
    comparisons: Optional[List[TransportMethodResult]] = None
    initial_method_used: Optional[str] = None
    initial_solution: Optional[TransportMethodResult] = None
    steps: Optional[List[SolutionStep]] = None
    steps_note: Optional[str] = None
    supply_duals: Optional[List[ConstraintDual]] = None
    demand_duals: Optional[List[ConstraintDual]] = None
    opportunity_costs: Optional[List[RouteSensitivity]] = None

@router.post("/solve", response_model=TransportSolutionOutput)
def solve_transport(payload: TransportProblemInput):
    try:
        # Valida que la matriz de costos tenga el tamaño esperado
        n_origins = len(payload.origins)
        n_destinations = len(payload.destinations)
        cost_matrix = np.array(payload.costs)

        if cost_matrix.shape != (n_origins, n_destinations):
            raise HTTPException(
                status_code=400,
                detail=f"Costs matrix shape {cost_matrix.shape} must match origins ({n_origins}) and destinations ({n_destinations})"
            )

        # Balancea el problema (agrega origen/destino ficticio si oferta != demanda)
        # antes de correr los métodos de solución inicial.
        bal_supply, bal_demand, bal_costs, bal_origins, bal_destinations = balance_transport_problem(
            payload.supply, payload.demand, payload.costs
        )

        # Calcula las tres soluciones iniciales solo para comparar en la interfaz
        # (cuál método arranca más cerca del óptimo), independiente de cuál se usa
        # realmente para alimentar a MODI.
        comparisons = []
        try:
            res_nw = northwest_corner(bal_supply, bal_demand, bal_costs, bal_origins, bal_destinations)
            comparisons.append(TransportMethodResult(**res_nw))

            res_mc = min_cost(bal_supply, bal_demand, bal_costs, bal_origins, bal_destinations)
            comparisons.append(TransportMethodResult(**res_mc))

            res_vo = vogel(bal_supply, bal_demand, bal_costs, bal_origins, bal_destinations)
            comparisons.append(TransportMethodResult(**res_vo))
        except Exception as e:
            print(f"Warning: Failed to compute initial methods: {e}")

        # Optimización paso a paso vía MODI, partiendo de la solución inicial elegida
        initial_key = (payload.initial_method or "vogel").lower()
        if initial_key not in INITIAL_METHODS:
            raise HTTPException(status_code=400, detail=f"initial_method inválido: {payload.initial_method}")

        initial_result = INITIAL_METHODS[initial_key](bal_supply, bal_demand, bal_costs, bal_origins, bal_destinations)

        steps = None
        steps_note = None
        try:
            modi_result = modi_optimize(
                bal_supply, bal_demand, bal_costs, bal_origins, bal_destinations, initial_result["allocations"]
            )
            steps = modi_result["steps"]
        except Exception as modi_err:
            steps_note = f"No se pudo generar el detalle paso a paso de MODI: {modi_err}"

        # Se modela el mismo problema de transporte como un LP en PuLP: esta es la
        # fuente de verdad numérica que ve el usuario (allocations/total_cost),
        # más robusta que MODI ante casos degenerados. MODI arriba solo alimentó
        # el panel de "steps".
        prob = pulp.LpProblem("Transportation_Problem", pulp.LpMinimize)

        # Variables de decisión: unidades enviadas de cada origen a cada destino
        routes = [(i, j) for i in range(n_origins) for j in range(n_destinations)]
        vars = pulp.LpVariable.dicts("Route", (range(n_origins), range(n_destinations)), lowBound=0, cat=pulp.LpContinuous)

        # Función objetivo: minimizar el costo total de transporte
        prob += pulp.lpSum([vars[i][j] * cost_matrix[i][j] for (i, j) in routes])

        # Restricciones de oferta: lo que sale de cada origen no puede superar su oferta
        for i in range(n_origins):
            supply_name = _pulp_safe_name(f"Supply_{payload.origins[i]}")
            prob += pulp.lpSum([vars[i][j] for j in range(n_destinations)]) <= payload.supply[i], supply_name

        # Restricciones de demanda: lo que llega a cada destino debe cubrir su demanda
        for j in range(n_destinations):
            demand_name = _pulp_safe_name(f"Demand_{payload.destinations[j]}")
            prob += pulp.lpSum([vars[i][j] for i in range(n_origins)]) >= payload.demand[j], demand_name

        # Resuelve con CBC
        solver = pulp.PULP_CBC_CMD(msg=False)
        status = prob.solve(solver)

        status_str = pulp.LpStatus[status]
        if status_str != "Optimal":
            raise HTTPException(status_code=400, detail=f"Transport model could not be solved: {status_str}")

        # Arma la lista de asignaciones con unidades > 0
        allocations = []
        for i in range(n_origins):
            for j in range(n_destinations):
                val = vars[i][j].varValue
                if val is not None and val > 0:
                    allocations.append(RouteAllocation(
                        origin=payload.origins[i],
                        destination=payload.destinations[j],
                        units=val,
                        cost=val * cost_matrix[i][j]
                    ))

        # Análisis de sensibilidad: precios sombra de oferta/demanda (pc.pi) y
        # costo de oportunidad de las rutas no usadas (pv.dj), igual que en el módulo de LP.
        supply_duals = []
        for i in range(n_origins):
            c = prob.constraints[_pulp_safe_name(f"Supply_{payload.origins[i]}")]
            supply_duals.append(ConstraintDual(
                name=payload.origins[i],
                shadow_price=c.pi if c.pi is not None else 0.0,
                slack=c.slack if c.slack is not None else 0.0,
            ))

        demand_duals = []
        for j in range(n_destinations):
            c = prob.constraints[_pulp_safe_name(f"Demand_{payload.destinations[j]}")]
            demand_duals.append(ConstraintDual(
                name=payload.destinations[j],
                shadow_price=c.pi if c.pi is not None else 0.0,
                slack=c.slack if c.slack is not None else 0.0,
            ))

        # Costo de oportunidad de las rutas NO usadas (dj): cuánto subiría el costo
        # total si se forzara 1 unidad por esa ruta. Se ordenan de menor a mayor
        # para mostrar primero las "menos malas" alternativas.
        opportunity_costs = []
        for i in range(n_origins):
            for j in range(n_destinations):
                val = vars[i][j].varValue
                if val is None or val <= 1e-9:
                    dj = vars[i][j].dj if vars[i][j].dj is not None else 0.0
                    opportunity_costs.append(RouteSensitivity(
                        origin=payload.origins[i],
                        destination=payload.destinations[j],
                        opportunity_cost=dj,
                    ))
        opportunity_costs.sort(key=lambda r: r.opportunity_cost)

        return TransportSolutionOutput(
            status=status_str,
            total_cost=pulp.value(prob.objective),
            allocations=allocations,
            comparisons=comparisons,
            initial_method_used=initial_key,
            initial_solution=TransportMethodResult(**initial_result),
            steps=steps,
            supply_duals=supply_duals,
            demand_duals=demand_duals,
            opportunity_costs=opportunity_costs,
            steps_note=steps_note
        )

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
