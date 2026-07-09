from typing import Any, Dict, List

from app.algorithms.steps import StepTracker

INF = float("inf")


def dijkstra(nodes: List[str], edges: List[Dict[str, Any]], source: str, target: str) -> Dict[str, Any]:
    """Ruta más corta con el algoritmo de Dijkstra (grafo dirigido, pesos no negativos),
    registrando cada nodo fijado y las relajaciones de distancia que provoca."""
    tracker = StepTracker()
    adjacency: Dict[str, List[tuple]] = {n: [] for n in nodes}
    for e in edges:
        w = e.get("weight", 1.0)
        if w < 0:
            raise ValueError("Dijkstra no admite pesos negativos; considere Bellman-Ford")
        adjacency.setdefault(e["source"], []).append((e["target"], w))

    dist = {n: INF for n in nodes}
    prev: Dict[str, str] = {}
    dist[source] = 0.0
    unvisited = set(nodes)

    tracker.add(
        "Inicialización",
        f"Se fija dist({source})=0 y dist(n)=∞ para el resto de los nodos, ya que aún no se ha "
        "explorado ningún camino.",
        {"distances": {n: (None if dist[n] == INF else round(dist[n], 4)) for n in nodes}},
    )

    while unvisited:
        reachable = [n for n in unvisited if dist[n] < INF]
        if not reachable:
            break
        u = min(reachable, key=lambda n: dist[n])
        unvisited.remove(u)

        relaxed = []
        for v, w in adjacency.get(u, []):
            if v in unvisited and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                prev[v] = u
                relaxed.append({"node": v, "new_distance": round(dist[v], 4)})

        tracker.add(
            f"Se fija la distancia definitiva de {u}",
            f"{u} es el nodo no visitado con menor distancia tentativa (dist({u})={dist[u]:.4g}), "
            "por lo que su distancia ya es óptima. Se relajan sus arcos salientes: "
            + (", ".join(f"{r['node']}→{r['new_distance']}" for r in relaxed) if relaxed else "sin mejoras."),
            {"fixed_node": u, "distances": {n: (None if dist[n] == INF else round(dist[n], 4)) for n in nodes}, "relaxed": relaxed},
        )

        if u == target:
            break

    if dist[target] == INF:
        return {"status": "No existe camino", "path": [], "cost": None, "steps": [s.model_dump() for s in tracker.steps]}

    path = [target]
    while path[-1] != source:
        path.append(prev[path[-1]])
    path.reverse()

    tracker.add(
        "Reconstrucción del camino",
        f"Siguiendo los predecesores desde {target} hasta {source} se obtiene la ruta óptima.",
        {"path": path, "cost": round(dist[target], 4)},
    )

    return {
        "status": "Optimal",
        "path": path,
        "cost": float(dist[target]),
        "steps": [s.model_dump() for s in tracker.steps],
    }
