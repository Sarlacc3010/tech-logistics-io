"""Algoritmo de Edmonds-Karp (Ford-Fulkerson usando BFS): flujo máximo entre un
nodo fuente y un nodo sumidero. Implementación propia (sin NetworkX), sobre un
grafo residual construido a mano."""

from collections import deque
from typing import Any, Dict, List

from app.algorithms.steps import StepTracker

MAX_ITERATIONS = 1000


def _bfs_augmenting_path(residual: Dict[str, Dict[str, float]], source: str, sink: str):
    """Busca con BFS el camino más corto (en número de arcos) desde source hasta
    sink que use solo arcos con capacidad residual positiva. BFS (en vez de DFS)
    es justo lo que distingue a Edmonds-Karp de Ford-Fulkerson genérico, y
    garantiza que el algoritmo termine en un número polinomial de iteraciones."""
    parent = {source: None}
    queue = deque([source])
    while queue:
        u = queue.popleft()
        if u == sink:
            break
        for v, cap in residual.get(u, {}).items():
            if cap > 1e-9 and v not in parent:
                parent[v] = u
                queue.append(v)
    if sink not in parent:
        return None  # no hay ningún camino con capacidad residual disponible
    # Reconstruye el camino siguiendo los predecesores desde sink hasta source.
    path = [sink]
    while path[-1] != source:
        path.append(parent[path[-1]])
    path.reverse()
    return path


def edmonds_karp(nodes: List[str], edges: List[Dict[str, Any]], source: str, sink: str) -> Dict[str, Any]:
    """Flujo máximo con Edmonds-Karp (Ford-Fulkerson con BFS), registrando cada camino de
    aumento encontrado y el flujo residual actualizado."""
    tracker = StepTracker()
    # Grafo residual: capacidad restante en cada arco. Cada arco original también
    # crea un arco inverso de capacidad 0, que se va habilitando a medida que se
    # envía flujo (permite "deshacer" una asignación anterior si conviene).
    residual: Dict[str, Dict[str, float]] = {n: {} for n in nodes}
    original_capacity: Dict[str, Dict[str, float]] = {}
    for e in edges:
        u, v, cap = e["source"], e["target"], e.get("capacity", float("inf"))
        residual.setdefault(u, {})
        residual.setdefault(v, {})
        residual[u][v] = residual[u].get(v, 0.0) + cap
        residual[v].setdefault(u, 0.0)  # arco inverso, arranca en 0
        original_capacity.setdefault(u, {})
        original_capacity[u][v] = original_capacity[u].get(v, 0.0) + cap

    tracker.add(
        "Grafo residual inicial",
        "El grafo residual arranca igual a las capacidades originales; cada arco tiene además "
        "un arco inverso de capacidad 0 que se irá habilitando a medida que se envíe flujo.",
        {"residual": {u: dict(vs) for u, vs in residual.items() if vs}},
    )

    max_flow = 0.0
    for _ in range(MAX_ITERATIONS):
        path = _bfs_augmenting_path(residual, source, sink)
        if path is None:
            # Ya no hay ningún camino con capacidad residual: por el teorema de
            # flujo máximo-corte mínimo, el flujo actual es el máximo posible.
            tracker.add(
                "Sin más caminos de aumento",
                f"BFS desde {source} ya no puede alcanzar {sink} por arcos con capacidad "
                "residual positiva, por lo que el flujo actual es máximo (corte mínimo saturado).",
                {"max_flow": round(max_flow, 4)},
            )
            break

        # El cuello de botella del camino es la menor capacidad residual entre
        # todos sus arcos: es cuánto flujo adicional se puede enviar por esa ruta.
        bottleneck = min(residual[path[i]][path[i + 1]] for i in range(len(path) - 1))
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            residual[u][v] -= bottleneck  # se consume capacidad en el sentido del flujo
            residual[v][u] += bottleneck  # se habilita esa capacidad en el arco inverso
        max_flow += bottleneck

        tracker.add(
            f"Camino de aumento: {' -> '.join(path)}",
            f"BFS encontró este camino con capacidad residual mínima (cuello de botella) de "
            f"{bottleneck:.4g}. Se envía esa cantidad de flujo por el camino y se actualiza el "
            "grafo residual (resta en el sentido del flujo, suma en el arco inverso).",
            {
                "path": path,
                "bottleneck": round(bottleneck, 4),
                "flow_so_far": round(max_flow, 4),
                "residual": {u: dict(vs) for u, vs in residual.items() if vs},
            },
        )
    else:
        raise RuntimeError("Edmonds-Karp no convergió dentro del número máximo de iteraciones")

    # El flujo real en cada arco es la capacidad original menos lo que le queda
    # de capacidad residual.
    flows = {
        u: {v: float(cap - residual[u].get(v, 0.0)) for v, cap in vs.items()}
        for u, vs in original_capacity.items()
    }

    return {
        "status": "Optimal",
        "max_flow": float(max_flow),
        "flows": flows,
        "steps": [s.model_dump() for s in tracker.steps],
    }
