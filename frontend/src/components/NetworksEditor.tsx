/**
 * Formulario manual del módulo de Redes: selector de algoritmo (ruta más
 * corta, árbol de expansión mínima, flujo máximo, flujo de costo mínimo),
 * tabla de nodos (con oferta/demanda solo si aplica) y tabla de arcos (con
 * peso/capacidad solo si aplica), ambas condicionadas al algoritmo elegido.
 * Si el JSON no tiene la forma esperada, cae a un textarea de JSON crudo.
 */
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface NetworksEditorProps {
  jsonText: string;
  onChange: (val: string) => void;
  dark?: boolean;
}

interface NetworkEdge {
  source: string;
  target: string;
  weight: number | null;
  capacity: number | null;
}

type Algorithm = "shortest_path" | "max_flow" | "min_cost_flow" | "min_spanning_tree";

interface NetworkData {
  algorithm: Algorithm;
  nodes: string[];
  edges: NetworkEdge[];
  source_node?: string | null;
  target_node?: string | null;
  demands?: Record<string, number> | null;
}

const ALGORITHM_LABELS: Record<Algorithm, string> = {
  shortest_path: "Ruta más corta (Dijkstra)",
  min_spanning_tree: "Árbol de expansión mínima (Kruskal)",
  max_flow: "Flujo máximo (Edmonds-Karp)",
  min_cost_flow: "Flujo de costo mínimo",
};

const NEEDS_SOURCE_TARGET: Algorithm[] = ["shortest_path", "max_flow"];
const NEEDS_DEMANDS: Algorithm[] = ["min_cost_flow"];
const NEEDS_WEIGHT: Algorithm[] = ["shortest_path", "min_spanning_tree", "min_cost_flow"];
const NEEDS_CAPACITY: Algorithm[] = ["max_flow", "min_cost_flow"];

export function NetworksEditor({ jsonText, onChange, dark = true }: NetworksEditorProps) {
  const [data, setData] = useState<NetworkData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) && typeof parsed.algorithm === 'string') {
        setData(parsed);
        setError(null);
      } else {
        setError('Estructura de JSON inválida para Redes.');
      }
    } catch (e) {
      setError('JSON inválido');
    }
  }, [jsonText]);

  const sync = (newData: NetworkData) => {
    setData(newData);
    onChange(JSON.stringify(newData, null, 2));
  };

  if (error || !data) {
    return (
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-amber-500 mb-2">
          <AlertCircle size={14} />
          <span className="text-xs font-mono">Usando editor de texto plano: {error}</span>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
          className="w-full font-mono text-xs p-3 rounded border bg-black text-emerald-400 focus:outline-none"
        />
      </div>
    );
  }

  const showSourceTarget = NEEDS_SOURCE_TARGET.includes(data.algorithm);
  const showDemands = NEEDS_DEMANDS.includes(data.algorithm);
  const showWeight = NEEDS_WEIGHT.includes(data.algorithm);
  const showCapacity = NEEDS_CAPACITY.includes(data.algorithm);

  const addNode = () => {
    const newName = `Node_${data.nodes.length + 1}`;
    const newNodes = [...data.nodes, newName];
    const newDemands = data.demands ? { ...data.demands, [newName]: 0 } : data.demands;
    sync({ ...data, nodes: newNodes, demands: newDemands });
  };

  const removeNode = (idx: number) => {
    const nodeName = data.nodes[idx];
    const newNodes = data.nodes.filter((_, i) => i !== idx);
    const newDemands = data.demands ? { ...data.demands } : data.demands;
    if (newDemands) delete newDemands[nodeName];
    const newEdges = data.edges.filter(e => e.source !== nodeName && e.target !== nodeName);
    const newSource = data.source_node === nodeName ? null : data.source_node;
    const newTarget = data.target_node === nodeName ? null : data.target_node;
    sync({ ...data, nodes: newNodes, demands: newDemands, edges: newEdges, source_node: newSource, target_node: newTarget });
  };

  const renameNode = (idx: number, newName: string) => {
    const oldName = data.nodes[idx];
    const newNodes = [...data.nodes];
    newNodes[idx] = newName;

    const newDemands = data.demands ? { ...data.demands } : data.demands;
    if (newDemands) {
      newDemands[newName] = newDemands[oldName] ?? 0;
      if (oldName !== newName) delete newDemands[oldName];
    }

    const newEdges = data.edges.map(e => ({
      ...e,
      source: e.source === oldName ? newName : e.source,
      target: e.target === oldName ? newName : e.target,
    }));

    sync({
      ...data,
      nodes: newNodes,
      demands: newDemands,
      edges: newEdges,
      source_node: data.source_node === oldName ? newName : data.source_node,
      target_node: data.target_node === oldName ? newName : data.target_node,
    });
  };

  const addEdge = () => {
    const newEdges = [...data.edges, { source: data.nodes[0] || "", target: data.nodes[1] || "", weight: 1, capacity: null }];
    sync({ ...data, edges: newEdges });
  };

  const removeEdge = (idx: number) => {
    const newEdges = data.edges.filter((_, i) => i !== idx);
    sync({ ...data, edges: newEdges });
  };

  const handleAlgorithmChange = (algorithm: Algorithm) => {
    const next: NetworkData = { ...data, algorithm };
    if (!NEEDS_SOURCE_TARGET.includes(algorithm)) {
      next.source_node = null;
      next.target_node = null;
    } else if (!next.source_node || !next.target_node) {
      next.source_node = next.source_node || data.nodes[0] || null;
      next.target_node = next.target_node || data.nodes[1] || null;
    }
    if (NEEDS_DEMANDS.includes(algorithm)) {
      next.demands = next.demands || Object.fromEntries(data.nodes.map(n => [n, 0]));
    } else {
      next.demands = null;
    }
    sync(next);
  };

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`;
  const borderColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <div className="p-4 flex flex-col gap-6">
      {/* Algorithm selector */}
      <div className="flex items-center gap-4 border-b pb-4" style={{ borderColor }}>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Algoritmo:</span>
        <select
          value={data.algorithm}
          onChange={e => handleAlgorithmChange(e.target.value as Algorithm)}
          className="bg-transparent border border-muted-foreground/30 rounded px-3 py-1.5 text-xs font-semibold focus:outline-none"
        >
          {Object.entries(ALGORITHM_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        {showSourceTarget && (
          <>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground ml-4">Origen:</span>
            <select
              value={data.source_node ?? ""}
              onChange={e => sync({ ...data, source_node: e.target.value })}
              className="bg-transparent border border-muted-foreground/30 rounded px-2 py-1.5 text-xs font-semibold focus:outline-none"
            >
              {data.nodes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Destino:</span>
            <select
              value={data.target_node ?? ""}
              onChange={e => sync({ ...data, target_node: e.target.value })}
              className="bg-transparent border border-muted-foreground/30 rounded px-2 py-1.5 text-xs font-semibold focus:outline-none"
            >
              {data.nodes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Nodes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Nodos</span>
            <button onClick={addNode} className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors">
              <Plus size={12} /> Agregar Nodo
            </button>
          </div>
          <div className="overflow-x-auto rounded border max-h-[300px] overflow-y-auto" style={{ borderColor }}>
            <table className="w-full text-xs">
              <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                <tr>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Nombre del Nodo</th>
                  {showDemands && <th className="p-2 text-center font-mono font-medium text-muted-foreground">Oferta / Demanda</th>}
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.nodes.map((n, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-2">
                      <input value={n} onChange={e => renameNode(i, e.target.value)} className={inputClass} />
                    </td>
                    {showDemands && (
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          value={data.demands?.[n] ?? 0}
                          onChange={e => {
                            const newDemands = { ...(data.demands || {}), [n]: parseFloat(e.target.value) || 0 };
                            sync({ ...data, demands: newDemands });
                          }}
                          className={`${inputClass} text-center font-semibold ${
                            (data.demands?.[n] || 0) > 0 ? 'text-emerald-500' :
                            (data.demands?.[n] || 0) < 0 ? 'text-red-400' : 'text-muted-foreground'
                          }`}
                        />
                      </td>
                    )}
                    <td className="p-2 text-center">
                      <button onClick={() => removeNode(i)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showDemands && <p className="text-[10px] text-muted-foreground mt-2 font-mono">Valores positivos = Oferta. Negativos = Demanda. Cero = Transbordo.</p>}
        </div>

        {/* Edges */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Arcos (Rutas)</span>
            <button onClick={addEdge} className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors">
              <Plus size={12} /> Agregar Arco
            </button>
          </div>
          <div className="overflow-x-auto rounded border max-h-[300px] overflow-y-auto" style={{ borderColor }}>
            <table className="w-full text-xs">
              <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                <tr>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Desde</th>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Hacia</th>
                  {showWeight && <th className="p-2 text-center font-mono font-medium text-muted-foreground">Peso / Costo</th>}
                  {showCapacity && <th className="p-2 text-center font-mono font-medium text-muted-foreground">Capacidad</th>}
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.edges.map((e, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-2">
                      <select
                        value={e.source}
                        onChange={ev => {
                          const newEdges = [...data.edges];
                          newEdges[i] = { ...newEdges[i], source: ev.target.value };
                          sync({ ...data, edges: newEdges });
                        }}
                        className="w-full bg-transparent border-b border-transparent focus:outline-none font-mono text-xs"
                      >
                        {data.nodes.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={e.target}
                        onChange={ev => {
                          const newEdges = [...data.edges];
                          newEdges[i] = { ...newEdges[i], target: ev.target.value };
                          sync({ ...data, edges: newEdges });
                        }}
                        className="w-full bg-transparent border-b border-transparent focus:outline-none font-mono text-xs"
                      >
                        {data.nodes.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    {showWeight && (
                      <td className="p-2">
                        <input
                          type="number"
                          value={e.weight ?? 0}
                          onChange={ev => {
                            const newEdges = [...data.edges];
                            newEdges[i] = { ...newEdges[i], weight: parseFloat(ev.target.value) || 0 };
                            sync({ ...data, edges: newEdges });
                          }}
                          className={`${inputClass} text-center`}
                        />
                      </td>
                    )}
                    {showCapacity && (
                      <td className="p-2">
                        <input
                          type="number"
                          value={e.capacity ?? 0}
                          onChange={ev => {
                            const newEdges = [...data.edges];
                            newEdges[i] = { ...newEdges[i], capacity: parseFloat(ev.target.value) || 0 };
                            sync({ ...data, edges: newEdges });
                          }}
                          className={`${inputClass} text-center font-semibold text-primary`}
                        />
                      </td>
                    )}
                    <td className="p-2 text-center">
                      <button onClick={() => removeEdge(i)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
