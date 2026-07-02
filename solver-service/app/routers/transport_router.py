from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import pulp

router = APIRouter()

class TransportProblemInput(BaseModel):
    origins: List[str]      # e.g., ["S1", "S2", "S3"]
    destinations: List[str]  # e.g., ["D1", "D2", "D3", "D4"]
    supply: List[float]      # e.g., [180, 240, 160]
    demand: List[float]      # e.g., [140, 160, 120, 160]
    costs: List[List[float]] # Cost matrix, size len(origins) x len(destinations)

class RouteAllocation(BaseModel):
    origin: str
    destination: str
    units: float
    cost: float

class TransportSolutionOutput(BaseModel):
    status: str
    total_cost: float
    allocations: List[RouteAllocation]

@router.post("/solve", response_model=TransportSolutionOutput)
def solve_transport(payload: TransportProblemInput):
    try:
        # Validate inputs using NumPy
        cost_matrix = np.array(payload.costs)
        n_origins = len(payload.origins)
        n_destinations = len(payload.destinations)
        
        if cost_matrix.shape != (n_origins, n_destinations):
            raise HTTPException(
                status_code=400,
                detail=f"Costs matrix shape {cost_matrix.shape} must match origins ({n_origins}) and destinations ({n_destinations})"
            )
            
        # Model transport problem in PuLP
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
            allocations=allocations
        )
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
