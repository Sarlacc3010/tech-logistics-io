from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import networkx as nx

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

@router.post("/solve", response_model=NetworkSolutionOutput)
def solve_network(payload: NetworkProblemInput):
    try:
        alg = payload.algorithm.lower()
        
        # Build NetworkX Graph
        if alg == "max_flow":
            G = nx.DiGraph()
            for e in payload.edges:
                cap = e.capacity if e.capacity is not None else float('inf')
                G.add_edge(e.source, e.target, capacity=cap)
        elif alg == "min_cost_flow":
            G = nx.DiGraph()
            for e in payload.edges:
                cap = int(e.capacity) if e.capacity is not None else None
                weight = int(e.weight) if e.weight is not None else 0
                G.add_edge(e.source, e.target, capacity=cap, weight=weight)
        elif alg == "shortest_path":
            G = nx.DiGraph()
            for e in payload.edges:
                w = e.weight if e.weight is not None else 1.0
                G.add_edge(e.source, e.target, weight=w)
        else: # min_spanning_tree
            G = nx.Graph()
            for e in payload.edges:
                w = e.weight if e.weight is not None else 1.0
                G.add_edge(e.source, e.target, weight=w)

        # Run Algorithms
        if alg == "shortest_path":
            if not payload.source_node or not payload.target_node:
                raise HTTPException(status_code=400, detail="source_node and target_node are required for shortest_path")
            length = nx.shortest_path_length(G, source=payload.source_node, target=payload.target_node, weight='weight')
            path = nx.shortest_path(G, source=payload.source_node, target=payload.target_node, weight='weight')
            return NetworkSolutionOutput(
                algorithm=payload.algorithm,
                status="Optimal",
                result={"path": path, "cost": length}
            )
            
        elif alg == "max_flow":
            if not payload.source_node or not payload.target_node:
                raise HTTPException(status_code=400, detail="source_node and target_node are required for max_flow")
            flow_value, flow_dict = nx.maximum_flow(G, payload.source_node, payload.target_node)
            return NetworkSolutionOutput(
                algorithm=payload.algorithm,
                status="Optimal",
                result={"total_flow": flow_value, "flows": flow_dict}
            )
            
        elif alg == "min_cost_flow":
            if not payload.demands:
                raise HTTPException(status_code=400, detail="demands dict is required for min_cost_flow")
            
            # Set node demands
            for node, d in payload.demands.items():
                G.nodes[node]['demand'] = int(d)
                
            flow_cost, flow_dict = nx.network_simplex(G)
            return NetworkSolutionOutput(
                algorithm=payload.algorithm,
                status="Optimal",
                result={"total_cost": flow_cost, "flows": flow_dict}
            )
            
        elif alg == "min_spanning_tree":
            mst = nx.minimum_spanning_tree(G, weight='weight')
            edges_result = []
            total_w = 0.0
            for u, v, data in mst.edges(data=True):
                w = data.get('weight', 1.0)
                total_w += w
                edges_result.append({"source": u, "target": v, "weight": w})
            return NetworkSolutionOutput(
                algorithm=payload.algorithm,
                status="Optimal",
                result={"total_weight": total_w, "edges": edges_result}
            )
            
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported network algorithm: {payload.algorithm}")
            
    except nx.NetworkXUnfeasible as e:
        raise HTTPException(status_code=400, detail=f"Network model is unfeasible: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
