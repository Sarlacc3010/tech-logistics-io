import numpy as np

def get_penalties(costs_matrix, supply, demand):
    row_penalties = []
    col_penalties = []
    
    for i in range(costs_matrix.shape[0]):
        if supply[i] == 0:
            row_penalties.append(-1)
            continue
        row = costs_matrix[i, :]
        valid_costs = row[row != np.inf]
        if len(valid_costs) >= 2:
            sorted_costs = np.sort(valid_costs)
            row_penalties.append(sorted_costs[1] - sorted_costs[0])
        elif len(valid_costs) == 1:
            row_penalties.append(valid_costs[0])
        else:
            row_penalties.append(-1)
            
    for j in range(costs_matrix.shape[1]):
        if demand[j] == 0:
            col_penalties.append(-1)
            continue
        col = costs_matrix[:, j]
        valid_costs = col[col != np.inf]
        if len(valid_costs) >= 2:
            sorted_costs = np.sort(valid_costs)
            col_penalties.append(sorted_costs[1] - sorted_costs[0])
        elif len(valid_costs) == 1:
            col_penalties.append(valid_costs[0])
        else:
            col_penalties.append(-1)
            
    return row_penalties, col_penalties

def vogel(supply: np.ndarray, demand: np.ndarray, costs: np.ndarray, origins: list[str], destinations: list[str]):
    """
    Algoritmo de Aproximación de Vogel (VAM).
    Utiliza penalizaciones para asignar unidades minimizando el costo de oportunidad.
    """
    supply = supply.copy()
    demand = demand.copy()
    costs_temp = costs.copy()
    
    allocations = []
    total_cost = 0.0
    
    while np.sum(supply) > 0 and np.sum(demand) > 0:
        row_penalties, col_penalties = get_penalties(costs_temp, supply, demand)
        
        max_row_penalty = max(row_penalties) if row_penalties else -1
        max_col_penalty = max(col_penalties) if col_penalties else -1
        
        if max_row_penalty == -1 and max_col_penalty == -1:
            break
            
        if max_row_penalty >= max_col_penalty:
            i = row_penalties.index(max_row_penalty)
            # Find min cost in this row
            row_costs = costs_temp[i, :]
            valid_indices = np.where(row_costs != np.inf)[0]
            if len(valid_indices) == 0:
                break
            j = valid_indices[np.argmin(row_costs[valid_indices])]
        else:
            j = col_penalties.index(max_col_penalty)
            # Find min cost in this col
            col_costs = costs_temp[:, j]
            valid_indices = np.where(col_costs != np.inf)[0]
            if len(valid_indices) == 0:
                break
            i = valid_indices[np.argmin(col_costs[valid_indices])]
            
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
        
        # Cross out satisfied row or col
        if supply[i] == 0:
            costs_temp[i, :] = np.inf
        elif demand[j] == 0:
            costs_temp[:, j] = np.inf
            
    return {
        "method": "Vogel",
        "total_cost": float(total_cost),
        "allocations": allocations
    }
