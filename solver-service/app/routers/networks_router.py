from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import networkx as nx

from app.algorithms.steps import SolutionStep
from app.algorithms.networks.dijkstra import dijkstra
from app.algorithms.networks.kruskal import kruskal
from app.algorithms.networks.max_flow import edmonds_karp

router = APIRouter()

class EdgeInput(BaseModel):
    source: str
    target: str
    capacity: Optional[float] = None
    weight: Optional[float] = None  # cost or distance

class NetworkProblemInput(BaseModel):
    algorithm: str  # "shortest_path", "max_flow", "min_cost_flow", "min_spanning_tree"
    nodes: List[str]
    edges: List[EdgeInput]
    source_node: Optional[str] = None
    target_node: Optional[str] = None
    demands: Optional[Dict[str, float]] = None  # positive for supply, negative for demand (for min_cost_flow)

class PathOutput(BaseModel):
    path: List[str]
    cost: float

class FlowOutput(BaseModel):
    total_flow: float
    flows: Dict[str, Dict[str, float]]

class MinCostFlowOutput(BaseModel):
    total_cost: float
    flows: Dict[str, Dict[str, float]]

class NetworkSolutionOutput(BaseModel):
    algorithm: str
    status: str
    result: Any
    steps: Optional[List[SolutionStep]] = None

@router.post("/solve", response_model=NetworkSolutionOutput)
def solve_network(payload: NetworkProblemInput):
    try:
        alg = payload.algorithm.lower()
        edge_dicts = [
            {
                "source": e.source,
                "target": e.target,
                "weight": e.weight if e.weight is not None else 1.0,
                "capacity": e.capacity if e.capacity is not None else float("inf"),
            }
            for e in payload.edges
        ]

        if alg == "shortest_path":
            if not payload.source_node or not payload.target_node:
                raise HTTPException(status_code=400, detail="source_node and target_node are required for shortest_path")
            r = dijkstra(payload.nodes, edge_dicts, payload.source_node, payload.target_node)
            if r["status"] != "Optimal":
                raise HTTPException(status_code=400, detail=f"No existe camino entre {payload.source_node} y {payload.target_node}")
            return NetworkSolutionOutput(
                algorithm=payload.algorithm,
                status="Optimal",
                result={"path": r["path"], "cost": r["cost"]},
                steps=r["steps"],
            )

        elif alg == "max_flow":
            if not payload.source_node or not payload.target_node:
                raise HTTPException(status_code=400, detail="source_node and target_node are required for max_flow")
            r = edmonds_karp(payload.nodes, edge_dicts, payload.source_node, payload.target_node)
            return NetworkSolutionOutput(
                algorithm=payload.algorithm,
                status="Optimal",
                result={"total_flow": r["max_flow"], "flows": r["flows"]},
                steps=r["steps"],
            )

        elif alg == "min_cost_flow":
            if not payload.demands:
                raise HTTPException(status_code=400, detail="demands dict is required for min_cost_flow")
            # nx.network_simplex requiere pesos/capacidades/demandas enteros; con int() se
            # truncaba la parte decimal en silencio. Se escala por SCALE (workaround oficial
            # de NetworkX) para conservar hasta 3 decimales exactos y se revierte al final.
            SCALE = 1000
            G = nx.DiGraph()
            for e in payload.edges:
                cap = round(e.capacity * SCALE) if e.capacity is not None and e.capacity != float("inf") else None
                weight = round((e.weight if e.weight is not None else 0.0) * SCALE)
                G.add_edge(e.source, e.target, capacity=cap, weight=weight)
            for node, d in payload.demands.items():
                G.nodes[node]['demand'] = round(d * SCALE)

            flow_cost, flow_dict = nx.network_simplex(G)
            flow_cost = flow_cost / (SCALE * SCALE)
            flow_dict = {u: {v: f / SCALE for v, f in vs.items()} for u, vs in flow_dict.items()}
            return NetworkSolutionOutput(
                algorithm=payload.algorithm,
                status="Optimal",
                result={"total_cost": flow_cost, "flows": flow_dict}
            )

        elif alg == "min_spanning_tree":
            r = kruskal(payload.nodes, edge_dicts)
            if r["status"] != "Optimal":
                raise HTTPException(status_code=400, detail="El grafo no está conectado; no existe un único árbol de expansión mínima")
            return NetworkSolutionOutput(
                algorithm=payload.algorithm,
                status="Optimal",
                result={"total_weight": r["total_weight"], "edges": r["edges"]},
                steps=r["steps"],
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported network algorithm: {payload.algorithm}")

    except HTTPException:
        raise
    except nx.NetworkXUnfeasible as e:
        raise HTTPException(status_code=400, detail=f"Network model is unfeasible: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
