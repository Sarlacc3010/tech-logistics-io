import numpy as np

def min_cost(supply: np.ndarray, demand: np.ndarray, costs: np.ndarray, origins: list[str], destinations: list[str]):
    """
    Algoritmo de Costo Mínimo.
    Asigna iterativamente al bloque con el menor costo posible.
    """
    supply = supply.copy()
    demand = demand.copy()
    
    # Use a masked array or a copy to cross out processed rows/cols by setting costs to infinity
    costs_temp = costs.copy()
    
    allocations = []
    total_cost = 0.0
    
    while np.sum(supply) > 0 and np.sum(demand) > 0:
        # Find indices of the minimum cost
        # Flattened index to 2D index
        min_idx = np.unravel_index(np.argmin(costs_temp, axis=None), costs_temp.shape)
        i, j = min_idx
        
        # If the minimum cost is infinity, we can't allocate anymore
        if costs_temp[i][j] == np.inf:
            break
            
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
        
        # Cross out row or column
        if supply[i] == 0:
            costs_temp[i, :] = np.inf
        if demand[j] == 0:
            costs_temp[:, j] = np.inf
            
    return {
        "method": "Costo Minimo",
        "total_cost": float(total_cost),
        "allocations": allocations
    }
