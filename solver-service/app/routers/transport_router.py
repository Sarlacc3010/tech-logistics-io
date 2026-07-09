from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import pulp

from app.algorithms.steps import SolutionStep
from app.algorithms.transport.utils import balance_transport_problem
from app.algorithms.transport.northwest import northwest_corner
from app.algorithms.transport.min_cost import min_cost
from app.algorithms.transport.vogel import vogel
from app.algorithms.transport.modi import modi_optimize

router = APIRouter()

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

class TransportSolutionOutput(BaseModel):
    status: str
    total_cost: float
    allocations: List[RouteAllocation]
    comparisons: Optional[List[TransportMethodResult]] = None
    initial_method_used: Optional[str] = None
    initial_solution: Optional[TransportMethodResult] = None
    steps: Optional[List[SolutionStep]] = None
    steps_note: Optional[str] = None

@router.post("/solve", response_model=TransportSolutionOutput)
def solve_transport(payload: TransportProblemInput):
    try:
        # Validate inputs
        n_origins = len(payload.origins)
        n_destinations = len(payload.destinations)
        cost_matrix = np.array(payload.costs)
        
        if cost_matrix.shape != (n_origins, n_destinations):
            raise HTTPException(
                status_code=400,
                detail=f"Costs matrix shape {cost_matrix.shape} must match origins ({n_origins}) and destinations ({n_destinations})"
            )
            
        # Balance the problem for initial methods
        bal_supply, bal_demand, bal_costs, bal_origins, bal_destinations = balance_transport_problem(
            payload.supply, payload.demand, payload.costs
        )
        
        # Calculate initial solutions
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

        # Model transport problem in PuLP for optimal solution
        prob = pulp.LpProblem("Transportation_Problem", pulp.LpMinimize)
        
        # Decision variables
        routes = [(i, j) for i in range(n_origins) for j in range(n_destinations)]
        vars = pulp.LpVariable.dicts("Route", (range(n_origins), range(n_destinations)), lowBound=0, cat=pulp.LpContinuous)
        
        # Objective
        prob += pulp.lpSum([vars[i][j] * cost_matrix[i][j] for (i, j) in routes])
        
        # Supply constraints
        for i in range(n_origins):
            prob += pulp.lpSum([vars[i][j] for j in range(n_destinations)]) <= payload.supply[i], f"Supply_{payload.origins[i]}"
            
        # Demand constraints
        for j in range(n_destinations):
            prob += pulp.lpSum([vars[i][j] for i in range(n_origins)]) >= payload.demand[j], f"Demand_{payload.destinations[j]}"
            
        # Solve
        solver = pulp.PULP_CBC_CMD(msg=False)
        status = prob.solve(solver)
        
        status_str = pulp.LpStatus[status]
        if status_str != "Optimal":
            raise HTTPException(status_code=400, detail=f"Transport model could not be solved: {status_str}")
            
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
                    
        return TransportSolutionOutput(
            status=status_str,
            total_cost=pulp.value(prob.objective),
            allocations=allocations,
            comparisons=comparisons,
            initial_method_used=initial_key,
            initial_solution=TransportMethodResult(**initial_result),
            steps=steps,
            steps_note=steps_note
        )
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
