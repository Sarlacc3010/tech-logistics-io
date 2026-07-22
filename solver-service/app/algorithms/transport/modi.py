"""Método MODI (Modified Distribution / multiplicadores u-v): optimiza una
solución inicial de transporte (generada por Noroeste, Costo Mínimo o Vogel)
hasta que ya no exista ninguna reasignación que reduzca el costo total.

Es el algoritmo que genera el detalle "paso a paso" del módulo de Transporte
que se muestra en el frontend. La respuesta numérica *oficial* (asignaciones y
costo total que ve el usuario) la recalcula por separado transport_router.py
con PuLP, por robustez ante casos degenerados; MODI converge matemáticamente
al mismo óptimo."""

from collections import Counter
from typing import Any, Dict, List

import numpy as np

from app.algorithms.steps import StepTracker

EPS = 1e-9
MAX_ITERATIONS = 200


def _basic_cells_from_allocations(allocations, origin_idx, dest_idx) -> Dict[tuple, float]:
    """Convierte la lista de asignaciones {origin, destination, units} de la
    solución inicial en un diccionario {(fila, columna): unidades} indexado por
    posición numérica en la matriz, que es como MODI trabaja internamente."""
    cells = {}
    for a in allocations:
        i, j = origin_idx[a["origin"]], dest_idx[a["destination"]]
        cells[(i, j)] = cells.get((i, j), 0.0) + a["units"]
    return cells


def _ensure_spanning_basis(basic: Dict[tuple, float], costs: np.ndarray, m: int, n: int) -> Dict[tuple, float]:
    """Garantiza m+n-1 celdas básicas conectadas (árbol de expansión sobre el grafo bipartito
    orígenes-destinos). Si la solución inicial es degenerada, agrega celdas con asignación 0
    en las de menor costo que conecten componentes separadas."""
    # Union-Find sobre m+n "nodos": los índices 0..m-1 son orígenes, m..m+n-1 son
    # destinos. Dos celdas básicas conectan su origen y su destino en el mismo
    # árbol; MODI necesita que ese árbol sea conexo y tenga exactamente m+n-1 aristas.
    parent = list(range(m + n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # compresión de camino
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra == rb:
            return False  # ya estaban conectados: agregarla formaría un ciclo
        parent[ra] = rb
        return True

    for (i, j) in basic:
        union(i, m + j)

    if len(basic) >= m + n - 1:
        return basic

    # Faltan celdas básicas (degeneración): se completan con las de menor costo
    # que sí conecten componentes distintas, en orden de costo ascendente.
    candidates = sorted(
        ((costs[i][j], i, j) for i in range(m) for j in range(n) if (i, j) not in basic),
        key=lambda x: x[0],
    )
    for _, i, j in candidates:
        if len(basic) == m + n - 1:
            break
        if union(i, m + j):
            basic[(i, j)] = 0.0  # celda básica "degenerada": está en la base pero con 0 unidades

    return basic


def _compute_uv(basic: Dict[tuple, float], costs: np.ndarray, m: int, n: int):
    """Calcula los multiplicadores uᵢ (por origen) y vⱼ (por destino) resolviendo
    el sistema uᵢ + vⱼ = cᵢⱼ sobre las celdas básicas, fijando u₀ = 0 como
    referencia (el sistema tiene un grado de libertad). Se propaga por el árbol
    de celdas básicas: cada vez que se conoce uno de los dos valores de una celda
    básica, se despeja el otro."""
    u = [None] * m
    v = [None] * n
    u[0] = 0.0
    changed = True
    while changed:
        changed = False
        for (i, j) in basic:
            if u[i] is not None and v[j] is None:
                v[j] = costs[i][j] - u[i]
                changed = True
            elif v[j] is not None and u[i] is None:
                u[i] = costs[i][j] - v[j]
                changed = True
    return u, v


def _find_loop(basic_cells: Dict[tuple, float], entering: tuple):
    """Encuentra el conjunto de celdas que forman el único ciclo cerrado que se crea
    al agregar `entering` a las celdas básicas. Se hace "podando" repetidamente las
    celdas que no pueden formar parte de un ciclo (su fila o columna tiene menos de
    2 celdas candidatas) hasta que solo queda el ciclo en sí."""
    cells = set(basic_cells) | {entering}
    changed = True
    while changed:
        changed = False
        row_count = Counter(i for i, j in cells)
        col_count = Counter(j for i, j in cells)
        to_remove = {(i, j) for (i, j) in cells if row_count[i] < 2 or col_count[j] < 2}
        if to_remove:
            cells -= to_remove
            changed = True
    return cells


def _order_loop(cells: set, start: tuple) -> List[tuple]:
    """Ordena las celdas del ciclo encontrado por `_find_loop` en una secuencia
    recorrible: alternando movimientos por fila y por columna a partir de `start`,
    de forma que el resultado sea el orden real en que se "camina" el ciclo (necesario
    para saber qué celdas suman y cuáles restan al transferir unidades)."""
    path = [start]
    visited = {start}
    current = start
    move_along_row = True
    for _ in range(len(cells)):
        i, j = current
        candidates = [c for c in cells if (c[0] == i if move_along_row else c[1] == j) and c not in visited]
        if not candidates:
            break
        current = candidates[0]
        path.append(current)
        visited.add(current)
        move_along_row = not move_along_row

    if len(path) != len(cells) or len(path) % 2 != 0:
        raise RuntimeError("No se pudo cerrar el ciclo de MODI; la solución básica podría no ser un árbol válido")
    return path


def modi_optimize(
    supply: List[float],
    demand: List[float],
    costs: List[List[float]],
    origins: List[str],
    destinations: List[str],
    initial_allocations: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Optimiza una solución inicial de transporte (Noroeste/Costo Mínimo/Vogel) con el método
    MODI (multiplicadores u, v) hasta que ningún costo reducido sea negativo."""
    tracker = StepTracker()
    m, n = len(origins), len(destinations)
    origin_idx = {name: i for i, name in enumerate(origins)}
    dest_idx = {name: j for j, name in enumerate(destinations)}
    costs_arr = np.array(costs, dtype=float)

    basic = _basic_cells_from_allocations(initial_allocations, origin_idx, dest_idx)
    basic = _ensure_spanning_basis(basic, costs_arr, m, n)

    tracker.add(
        "MODI: base inicial",
        f"Se toma la solución inicial ({len(initial_allocations)} asignaciones) como base de "
        f"partida. Una solución no degenerada requiere m+n-1 = {m + n - 1} celdas básicas.",
        {
            "allocations": [
                {"origin": origins[i], "destination": destinations[j], "units": round(q, 4)}
                for (i, j), q in basic.items()
            ]
        },
    )

    for iteration in range(MAX_ITERATIONS):
        u, v = _compute_uv(basic, costs_arr, m, n)
        # Costo reducido de cada celda no básica: cuánto cambiaría el costo total
        # por cada unidad que se mueva a esa celda. Si es negativo, conviene usarla.
        reduced_costs = {
            (i, j): costs_arr[i][j] - (u[i] + v[j])
            for i in range(m)
            for j in range(n)
            if (i, j) not in basic
        }

        snapshot = {
            "u": [round(x, 4) if x is not None else None for x in u],
            "v": [round(x, 4) if x is not None else None for x in v],
            "reduced_costs": [
                {"origin": origins[i], "destination": destinations[j], "value": round(float(rc), 4)}
                for (i, j), rc in reduced_costs.items()
            ],
        }

        negative = {cell: rc for cell, rc in reduced_costs.items() if rc < -EPS}
        if not negative:
            tracker.add(
                "MODI: óptimo alcanzado",
                "Todos los costos reducidos (cᵢⱼ - uᵢ - vⱼ) de las celdas no básicas son >= 0; "
                "ninguna reasignación puede reducir más el costo total.",
                snapshot,
            )
            break

        # Entra la celda con el costo reducido más negativo (mayor ahorro potencial).
        entering = min(negative, key=negative.get)
        tracker.add(
            f"MODI iteración {iteration + 1}: multiplicadores y celda entrante",
            f"Se calculan uᵢ, vⱼ resolviendo uᵢ + vⱼ = cᵢⱼ sobre las celdas básicas (fijando "
            f"u₁=0). La celda ({origins[entering[0]]}, {destinations[entering[1]]}) tiene el "
            f"costo reducido más negativo ({negative[entering]:.4g}) y entra a la base.",
            snapshot,
        )

        loop_cells = _find_loop(basic, entering)
        path = _order_loop(loop_cells, entering)
        # Las celdas en posición impar del ciclo son las que "restan" unidades
        # (theta es el mínimo de esas, para no dejar ninguna en negativo).
        minus_cells = path[1::2]

        theta = min(basic.get(c, 0.0) for c in minus_cells)
        # Si hay empate en el mínimo, se elige de forma determinista (celda más
        # "pequeña" por orden de tupla) para que el algoritmo sea reproducible.
        leaving = min((c for c in minus_cells if abs(basic.get(c, 0.0) - theta) < EPS), key=lambda c: c)

        # Recorre el ciclo transfiriendo theta unidades: suma en las celdas pares
        # (incluida la entrante) y resta en las impares.
        for idx, cell in enumerate(path):
            sign = 1 if idx % 2 == 0 else -1
            basic[cell] = basic.get(cell, 0.0) + sign * theta
        del basic[leaving]  # la celda que llegó a 0 sale de la base

        tracker.add(
            f"MODI iteración {iteration + 1}: ciclo de ajuste",
            f"Ciclo cerrado: {' -> '.join(f'({origins[i]},{destinations[j]})' for i, j in path)}. "
            f"Se transfieren θ={theta:.4g} unidades alrededor del ciclo (+ en celdas pares, - en "
            f"impares); sale de la base ({origins[leaving[0]]}, {destinations[leaving[1]]}).",
            {
                "loop": [{"origin": origins[i], "destination": destinations[j]} for i, j in path],
                "theta": round(float(theta), 4),
                "leaving_cell": {"origin": origins[leaving[0]], "destination": destinations[leaving[1]]},
            },
        )
    else:
        raise RuntimeError("MODI no convergió dentro del número máximo de iteraciones")

    # Arma la lista final de asignaciones (se descartan las celdas básicas con 0
    # unidades, que solo existían para completar el árbol de expansión).
    allocations = []
    total_cost = 0.0
    for (i, j), qty in basic.items():
        if qty > EPS:
            cost = qty * costs_arr[i][j]
            total_cost += cost
            allocations.append({
                "origin": origins[i], "destination": destinations[j],
                "units": float(qty), "cost": float(cost),
            })

    return {
        "method": "MODI",
        "total_cost": float(total_cost),
        "allocations": allocations,
        "steps": [s.model_dump() for s in tracker.steps],
    }
