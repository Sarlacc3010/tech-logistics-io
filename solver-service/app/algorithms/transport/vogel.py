"""Aproximación de Vogel (VAM): genera una solución inicial factible para el
problema de transporte usando penalizaciones de costo de oportunidad, lo que
la hace casi óptima de entrada (mejor punto de partida que Noroeste o Costo
Mínimo para MODI, ver modi.py)."""

import numpy as np

def get_penalties(costs_matrix, supply, demand):
    """Calcula la penalización de cada fila y columna: la diferencia entre el
    costo más barato y el segundo más barato disponibles en esa fila/columna.
    Una penalización alta significa que "equivocarse" de celda en esa fila o
    columna sale caro, por eso VAM atiende primero la de mayor penalización."""
    row_penalties = []
    col_penalties = []

    for i in range(costs_matrix.shape[0]):
        if supply[i] == 0:
            row_penalties.append(-1)  # fila ya saturada, no participa
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
            col_penalties.append(-1)  # columna ya saturada, no participa
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

        # Se atiende la fila o columna con mayor penalización (la que sale más
        # cara si no se asigna en su celda más barata), y dentro de ella se
        # asigna en la celda de menor costo.
        if max_row_penalty >= max_col_penalty:
            i = row_penalties.index(max_row_penalty)
            # Encuentra el costo mínimo dentro de esa fila
            row_costs = costs_temp[i, :]
            valid_indices = np.where(row_costs != np.inf)[0]
            if len(valid_indices) == 0:
                break
            j = valid_indices[np.argmin(row_costs[valid_indices])]
        else:
            j = col_penalties.index(max_col_penalty)
            # Encuentra el costo mínimo dentro de esa columna
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

        # Tacha la fila o columna que quedó saturada (igual que en Costo Mínimo).
        if supply[i] == 0:
            costs_temp[i, :] = np.inf
        elif demand[j] == 0:
            costs_temp[:, j] = np.inf

    return {
        "method": "Vogel",
        "total_cost": float(total_cost),
        "allocations": allocations
    }
