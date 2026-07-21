from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any

from app.algorithms.steps import SolutionStep, StepTracker

router = APIRouter()

class DPProblemInput(BaseModel):
    problem_type: str  # "knapsack" or "lot_sizing"
    parameters: Dict[str, Any]

class DPSolutionOutput(BaseModel):
    status: str
    optimal_value: float
    decisions: List[Any]
    details: Optional[Dict[str, Any]] = None
    steps: Optional[List[SolutionStep]] = None

@router.post("/solve", response_model=DPSolutionOutput)
def solve_dynamic(payload: DPProblemInput):
    try:
        prob_type = payload.problem_type.lower()
        
        if prob_type == "knapsack":
            # Knapsack parameters
            weights = payload.parameters.get("weights", [])
            values = payload.parameters.get("values", [])
            capacity = payload.parameters.get("capacity", 0)
            n = len(weights)
            
            if len(values) != n:
                raise HTTPException(status_code=400, detail="weights and values lists must have the same length")

            tracker = StepTracker()
            tracker.add(
                "Inicialización",
                f"dp[i][w] representa el valor máximo alcanzable usando los primeros i objetos con "
                f"capacidad w. dp[0][w] = 0 para toda w (sin objetos no hay valor).",
                {"capacity": capacity, "n_items": n},
            )

            # DP table
            dp = [[0 for _ in range(capacity + 1)] for _ in range(n + 1)]

            for i in range(1, n + 1):
                for w in range(capacity + 1):
                    if weights[i-1] <= w:
                        dp[i][w] = max(values[i-1] + dp[i-1][w-weights[i-1]], dp[i-1][w])
                    else:
                        dp[i][w] = dp[i-1][w]

                tracker.add(
                    f"Objeto {i} (peso={weights[i-1]:g}, valor={values[i-1]:g})",
                    f"Para cada capacidad w: si el objeto cabe (peso <= w), dp[{i}][w] = "
                    f"max(valor + dp[{i-1}][w-peso], dp[{i-1}][w]); si no cabe, dp[{i}][w] = dp[{i-1}][w]. "
                    f"Fila resultante: dp[{i}] = {dp[i]}.",
                    {"row": i, "dp_row": list(dp[i])},
                )

            # Backtrack to find items
            w = capacity
            selected_items = []
            for i in range(n, 0, -1):
                if dp[i][w] != dp[i-1][w]:
                    selected_items.append(i-1)
                    w -= weights[i-1]

            tracker.add(
                "Retroceso (backtracking)",
                "Se recorre la tabla desde dp[n][capacidad] hacia atrás: si dp[i][w] != dp[i-1][w] "
                "el objeto i se incluyó en la solución óptima, y se reduce w en su peso; si son "
                "iguales, el objeto i no se usó y se sigue con la fila anterior en la misma w.",
                {"selected_items_0indexed": selected_items, "optimal_value": dp[n][capacity]},
            )

            return DPSolutionOutput(
                status="Optimal",
                optimal_value=float(dp[n][capacity]),
                decisions=selected_items,
                details={"dp_table": dp},
                steps=tracker.steps,
            )
            
        elif prob_type == "lot_sizing":
            # Wagner-Whitin algorithm or basic lot-sizing DP
            demands = payload.parameters.get("demands", [])  # demand for each period
            setup_cost = payload.parameters.get("setup_cost", 0.0)
            holding_cost = payload.parameters.get("holding_cost", 0.0)
            n = len(demands)
            
            tracker = StepTracker()
            tracker.add(
                "Inicialización (Wagner-Whitin)",
                f"dp[i] es el costo mínimo para satisfacer la demanda desde el período i hasta el "
                f"final ({n}). Se fija dp[{n}]=0 (no queda demanda por cubrir) y se calcula hacia "
                "atrás, evaluando en cada período i todos los posibles próximos pedidos j.",
                {"n_periods": n, "setup_cost": setup_cost, "holding_cost": holding_cost},
            )

            # dp[i] is the minimum cost to satisfy demand from period i to n
            dp = [float('inf')] * (n + 1)
            dp[n] = 0.0
            best_next = [-1] * n

            for i in range(n - 1, -1, -1):
                current_holding = 0.0
                accum_demand = 0.0
                for j in range(i, n):
                    accum_demand += demands[j]
                    current_holding += demands[j] * (j - i) * holding_cost
                    cost = setup_cost + current_holding + dp[j + 1]
                    if cost < dp[i]:
                        dp[i] = cost
                        best_next[i] = j + 1

                tracker.add(
                    f"Período {i + 1}: dp[{i + 1}] = {dp[i]:.4g}",
                    f"Se evalúa pedir en el período {i + 1} y cubrir hasta cada período j >= {i + 1}: "
                    f"costo = S + costo_de_mantener_acumulado + dp[j+1]. El mínimo se logra cubriendo "
                    f"hasta el período {best_next[i]}, con costo total {dp[i]:.4g}.",
                    {"period": i + 1, "dp_value": round(dp[i], 4), "covers_up_to_period": best_next[i]},
                )

            # Reconstruct decisions
            decisions = []
            curr = 0
            while curr < n:
                nxt = best_next[curr]
                # Order in period `curr` covers demand up to `nxt - 1`
                qty = sum(demands[curr:nxt])
                decisions.append({
                    "period": curr + 1,
                    "order_qty": qty,
                    "covered_periods": list(range(curr + 1, nxt + 1))
                })
                curr = nxt

            tracker.add(
                "Política de pedidos reconstruida",
                "Siguiendo best_next desde el período 1 se arma la política óptima: cada pedido "
                "cubre la demanda de todos los períodos hasta el siguiente punto de pedido.",
                {"decisions": decisions, "optimal_value": round(dp[0], 4)},
            )

            return DPSolutionOutput(
                status="Optimal",
                optimal_value=float(dp[0]),
                decisions=decisions,
                details={"min_cost_by_stage": dp},
                steps=tracker.steps,
            )
            
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported DP problem type: {payload.problem_type}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
