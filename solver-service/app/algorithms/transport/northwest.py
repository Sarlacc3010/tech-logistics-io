"""Método de la Esquina Noroeste: genera una solución inicial factible para el
problema de transporte sin considerar costos. Sirve como punto de partida para
la optimización con MODI (modi.py)."""

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
        # Se asigna lo máximo posible entre lo que le queda al origen i y lo que
        # le falta al destino j (satura al menos una de las dos restricciones).
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

        # Avanza a la siguiente fila y/o columna según cuál quedó agotada
        # (si ambas quedan en 0 a la vez, avanza en diagonal).
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
