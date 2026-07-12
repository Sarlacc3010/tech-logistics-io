import numpy as np

def northwest_corner(supply: np.ndarray, demand: np.ndarray, costs: np.ndarray, origins: list[str], destinations: list[str]):
    """
    Algoritmo de la Esquina Noroeste.
    No considera costos, simplemente asigna empezando desde la esquina superior izquierda.
    """
    supply = supply.copy()
    demand = demand.copy()
    
    allocations = []
    total_cost = 0.0
    
    i, j = 0, 0
    while i < len(supply) and j < len(demand):
        quantity = min(supply[i], demand[j])
        
        if quantity > 0:
            cost = quantity * costs[i][j]
            total_cost += cost
            allocations.append({
                "origin": origins[i],
                "destination": destinations[j],
                "units": float(quantity),
                "cost": float(cost)
            })
            
        supply[i] -= quantity
        demand[j] -= quantity
        
        if supply[i] == 0 and i < len(supply) - 1:
            i += 1
        elif demand[j] == 0 and j < len(demand) - 1:
            j += 1
        else:
            i += 1
            j += 1
            
    return {
        "method": "Noroeste",
        "total_cost": float(total_cost),
        "allocations": allocations
    }
