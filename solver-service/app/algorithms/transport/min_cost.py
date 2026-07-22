"""Método del Costo Mínimo: genera una solución inicial factible para el problema
de transporte asignando siempre en la celda más barata disponible (mejor punto
de partida que Noroeste, aunque no tan bueno como Vogel). Sirve como una de las
tres opciones de solución inicial para MODI (modi.py)."""

import numpy as np

def min_cost(supply: np.ndarray, demand: np.ndarray, costs: np.ndarray, origins: list[str], destinations: list[str]):
    """
    Algoritmo de Costo Mínimo.
    Asigna iterativamente al bloque con el menor costo posible.
    """
    supply = supply.copy()
    demand = demand.copy()

    # Se usa una copia de la matriz de costos donde se "tachan" filas/columnas
    # ya saturadas poniéndolas en infinito, para que argmin nunca las vuelva a elegir.
    costs_temp = costs.copy()

    allocations = []
    total_cost = 0.0

    while np.sum(supply) > 0 and np.sum(demand) > 0:
        # Busca la celda de menor costo entre las que todavía no están tachadas.
        min_idx = np.unravel_index(np.argmin(costs_temp, axis=None), costs_temp.shape)
        i, j = min_idx

        # Si el mínimo restante es infinito, ya no queda ninguna celda disponible.
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

        # Tacha la fila y/o columna que quedó saturada.
        if supply[i] == 0:
            costs_temp[i, :] = np.inf
        if demand[j] == 0:
            costs_temp[:, j] = np.inf

    return {
        "method": "Costo Minimo",
        "total_cost": float(total_cost),
        "allocations": allocations
    }
