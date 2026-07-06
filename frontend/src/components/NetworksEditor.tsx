import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface NetworksEditorProps {
  jsonText: string;
  onChange: (val: string) => void;
  dark?: boolean;
}

interface NetworkEdge {
  from: string;
  to: string;
  cost: number;
  capacity: number;
}

interface NetworkData {
  nodes: string[];
  edges: NetworkEdge[];
  supply_demand: Record<string, number>;
}

export function NetworksEditor({ jsonText, onChange, dark = true }: NetworksEditorProps) {
  const [data, setData] = useState<NetworkData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) && parsed.supply_demand) {
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

  const addNode = () => {
    const newName = `Node_${data.nodes.length + 1}`;
    const newNodes = [...data.nodes, newName];
    const newSD = { ...data.supply_demand, [newName]: 0 };
    sync({ ...data, nodes: newNodes, supply_demand: newSD });
  };

  const removeNode = (idx: number) => {
    const nodeName = data.nodes[idx];
    const newNodes = data.nodes.filter((_, i) => i !== idx);
    const newSD = { ...data.supply_demand };
    delete newSD[nodeName];
    // Remove edges connected to this node
    const newEdges = data.edges.filter(e => e.from !== nodeName && e.to !== nodeName);
    sync({ ...data, nodes: newNodes, supply_demand: newSD, edges: newEdges });
  };

  const renameNode = (idx: number, newName: string) => {
    const oldName = data.nodes[idx];
    const newNodes = [...data.nodes];
    newNodes[idx] = newName;

    const newSD = { ...data.supply_demand };
    newSD[newName] = newSD[oldName] || 0;
    if (oldName !== newName) delete newSD[oldName];

    const newEdges = data.edges.map(e => ({
      ...e,
      from: e.from === oldName ? newName : e.from,
      to: e.to === oldName ? newName : e.to
    }));

    sync({ ...data, nodes: newNodes, supply_demand: newSD, edges: newEdges });
  };

  const addEdge = () => {
    const newEdges = [...data.edges, { from: data.nodes[0] || "", to: data.nodes[1] || "", cost: 0, capacity: 0 }];
    sync({ ...data, edges: newEdges });
  };

  const removeEdge = (idx: number) => {
    const newEdges = data.edges.filter((_, i) => i !== idx);
    sync({ ...data, edges: newEdges });
  };

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`;
  
  const totalSupply = data.nodes.reduce((sum, n) => sum + (data.supply_demand[n] > 0 ? data.supply_demand[n] : 0), 0);
  const totalDemand = data.nodes.reduce((sum, n) => sum + (data.supply_demand[n] < 0 ? Math.abs(data.supply_demand[n]) : 0), 0);
  const isBalanced = totalSupply === totalDemand;

  return (
    <div className="p-4 flex flex-col gap-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">Estado de la Red:</span>
        <span className={`text-[10px] font-mono font-bold ${isBalanced ? 'text-emerald-500' : 'text-amber-500'}`}>
          {isBalanced ? `BALANCEADA (${totalSupply} u)` : `DESBALANCEADA (O: ${totalSupply}, D: ${totalDemand})`}
        </span>
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
          <div className="overflow-x-auto rounded border max-h-[300px] overflow-y-auto" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
            <table className="w-full text-xs">
              <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                <tr>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Nombre del Nodo</th>
                  <th className="p-2 text-center font-mono font-medium text-muted-foreground">Oferta / Demanda</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.nodes.map((n, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-2">
                      <input 
                        value={n} 
                        onChange={e => renameNode(i, e.target.value)}
                        className={inputClass} 
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input 
                        type="number" 
                        value={data.supply_demand[n] ?? 0} 
                        onChange={e => {
                          const newSD = { ...data.supply_demand, [n]: parseFloat(e.target.value) || 0 };
                          sync({ ...data, supply_demand: newSD });
                        }}
                        className={`${inputClass} text-center font-semibold ${
                          (data.supply_demand[n] || 0) > 0 ? 'text-emerald-500' : 
                          (data.supply_demand[n] || 0) < 0 ? 'text-red-400' : 'text-muted-foreground'
                        }`} 
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => removeNode(i)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 font-mono">Valores positivos = Oferta. Negativos = Demanda. Cero = Transbordo.</p>
        </div>

        {/* Edges */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Arcos (Rutas)</span>
            <button onClick={addEdge} className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors">
              <Plus size={12} /> Agregar Arco
            </button>
          </div>
          <div className="overflow-x-auto rounded border max-h-[300px] overflow-y-auto" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
            <table className="w-full text-xs">
              <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                <tr>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Desde</th>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Hacia</th>
                  <th className="p-2 text-center font-mono font-medium text-muted-foreground">Costo Unitario</th>
                  <th className="p-2 text-center font-mono font-medium text-muted-foreground">Capacidad Max</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.edges.map((e, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-2">
                      <select 
                        value={e.from}
                        onChange={ev => {
                          const newEdges = [...data.edges];
                          newEdges[i].from = ev.target.value;
                          sync({ ...data, edges: newEdges });
                        }}
                        className="w-full bg-transparent border-b border-transparent focus:outline-none font-mono text-xs"
                      >
                        {data.nodes.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <select 
                        value={e.to}
                        onChange={ev => {
                          const newEdges = [...data.edges];
                          newEdges[i].to = ev.target.value;
                          sync({ ...data, edges: newEdges });
                        }}
                        className="w-full bg-transparent border-b border-transparent focus:outline-none font-mono text-xs"
                      >
                        {data.nodes.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <input 
                        type="number" 
                        value={e.cost} 
                        onChange={ev => {
                          const newEdges = [...data.edges];
                          newEdges[i].cost = parseFloat(ev.target.value) || 0;
                          sync({ ...data, edges: newEdges });
                        }}
                        className={`${inputClass} text-center`} 
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="number" 
                        value={e.capacity} 
                        onChange={ev => {
                          const newEdges = [...data.edges];
                          newEdges[i].capacity = parseFloat(ev.target.value) || 0;
                          sync({ ...data, edges: newEdges });
                        }}
                        className={`${inputClass} text-center font-semibold text-primary`} 
                      />
                    </td>
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
