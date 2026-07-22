"""Algoritmo de Kruskal: árbol de expansión mínima de un grafo no dirigido.
Implementación propia (sin NetworkX), con una estructura Union-Find manual
para detectar ciclos."""

from typing import Any, Dict, List

from app.algorithms.steps import StepTracker


class _UnionFind:
    """Estructura de conjuntos disjuntos con compresión de camino: permite saber
    en tiempo casi constante si dos nodos ya están en el mismo componente
    conectado (find) y unir dos componentes (union). Es lo que usa Kruskal para
    detectar si agregar una arista formaría un ciclo."""

    def __init__(self, items: List[str]):
        self.parent = {x: x for x in items}

    def find(self, x: str) -> str:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]  # compresión de camino
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> bool:
        """Une los componentes de a y b. Devuelve False si ya estaban en el mismo
        componente (es decir, unirlos formaría un ciclo)."""
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        self.parent[ra] = rb
        return True


def kruskal(nodes: List[str], edges: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Árbol de expansión mínima con el algoritmo de Kruskal (grafo no dirigido), registrando
    cada arista evaluada y si se acepta o se rechaza por formar un ciclo."""
    tracker = StepTracker()
    # Estrategia voraz: se evalúan las aristas de menor a mayor peso, aceptando
    # siempre la más barata que no cierre un ciclo (esto garantiza el óptimo).
    ordered = sorted(edges, key=lambda e: e.get("weight", 1.0))
    uf = _UnionFind(nodes)

    tracker.add(
        "Ordenar aristas por peso",
        "Se ordenan todas las aristas de menor a mayor peso; Kruskal las evalúa en ese orden, "
        "aceptando siempre la más barata que no cierre un ciclo.",
        {"ordered_edges": [{"source": e["source"], "target": e["target"], "weight": e.get("weight", 1.0)} for e in ordered]},
    )

    mst_edges = []
    total_weight = 0.0
    for e in ordered:
        u, v, w = e["source"], e["target"], e.get("weight", 1.0)
        if uf.union(u, v):
            # u y v estaban en componentes distintas: agregar esta arista conecta
            # dos "islas" sin cerrar ningún ciclo, así que se acepta.
            mst_edges.append({"source": u, "target": v, "weight": w})
            total_weight += w
            tracker.add(
                f"Aceptar arista ({u}, {v})",
                f"{u} y {v} están en componentes distintas, así que agregarla no forma ciclo. "
                f"Se incorpora al árbol (peso {w:.4g}).",
                {"accepted": True, "mst_so_far": list(mst_edges), "total_weight": round(total_weight, 4)},
            )
        else:
            # u y v ya estaban conectados por otro camino dentro del árbol parcial:
            # agregar esta arista formaría un ciclo, así que se descarta.
            tracker.add(
                f"Rechazar arista ({u}, {v})",
                f"{u} y {v} ya están conectados dentro del árbol parcial; agregarla formaría un "
                "ciclo, así que se descarta.",
                {"accepted": False},
            )
        if len(mst_edges) == len(nodes) - 1:
            break  # un árbol de expansión de n nodos siempre tiene exactamente n-1 aristas

    connected = len(mst_edges) == len(nodes) - 1
    return {
        "status": "Optimal" if connected else "Grafo desconectado",
        "edges": mst_edges,
        "total_weight": float(total_weight),
        "steps": [s.model_dump() for s in tracker.steps],
    }
