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
  weight: number;
  capacity: number;
}

interface NetworkData {
  algorithm: string;
  nodes: string[];
  edges: NetworkEdge[];
  source_node?: string;
  target_node?: string;
}

export function NetworksEditor({ jsonText, onChange, dark = true }: NetworksEditorProps) {
  const [data, setData] = useState<NetworkData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed.edges)) {
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

  const addEdge = () => {
    const newEdges = [...data!.edges, { source: "", target: "", weight: 0, capacity: 9999 }];
    sync({ ...data!, edges: newEdges });
  };

  const removeEdge = (idx: number) => {
    const newEdges = data!.edges.filter((_, i) => i !== idx);
    const uniqueNodes = Array.from(new Set(newEdges.flatMap(e => [e.source, e.target]).filter(Boolean)));
    sync({ ...data!, edges: newEdges, nodes: uniqueNodes });
  };

  const updateEdge = (idx: number, field: keyof NetworkEdge, value: string | number) => {
    const newEdges = [...data!.edges];
    newEdges[idx] = { ...newEdges[idx], [field]: value } as any;
    const uniqueNodes = Array.from(new Set(newEdges.flatMap(e => [e.source, e.target]).filter(Boolean)));
    sync({ ...data!, edges: newEdges, nodes: uniqueNodes });
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

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`;
  const selectClass = `w-full p-2 border rounded ${dark ? 'bg-[#0f0f13] border-white/10 text-white' : 'bg-white border-black/10 text-black'} font-mono text-xs focus:outline-none focus:border-amber-500`;

  const uniqueNodes = Array.from(new Set(data.edges.flatMap(e => [e.source, e.target]).filter(Boolean)));

  return (
    <div className="p-4 flex flex-col gap-6">
      
      {/* Configuration Controls */}
      <div className="flex flex-col md:flex-row gap-4 bg-secondary/10 p-4 rounded-lg border border-border">
        <div className="flex-1">
          <label className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground block mb-1">Algoritmo de Resolución</label>
          <select 
            value={data.algorithm || "shortest_path"} 
            onChange={e => sync({ ...data, algorithm: e.target.value })}
            className={selectClass}
          >
            <option value="shortest_path">Ruta Más Corta (Shortest Path)</option>
            <option value="max_flow">Flujo Máximo (Max Flow)</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground block mb-1">Origen Padre (Source Node)</label>
          <select 
            value={data.source_node || ""} 
            onChange={e => sync({ ...data, source_node: e.target.value })}
            className={selectClass}
          >
            <option value="">-- Seleccionar --</option>
            {uniqueNodes.map(n => <option key={n} value={n}>{n.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground block mb-1">Destino Padre (Target Node)</label>
          <select 
            value={data.target_node || ""} 
            onChange={e => sync({ ...data, target_node: e.target.value })}
            className={selectClass}
          >
            <option value="">-- Seleccionar --</option>
            {uniqueNodes.map(n => <option key={n} value={n}>{n.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      {/* Edges Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Arcos (Rutas)</span>
          <button onClick={addEdge} className="flex items-center gap-1 text-[10px] font-mono border px-3 py-1.5 rounded hover:bg-emerald-500/20 hover:text-emerald-500 hover:border-emerald-500/50 transition-colors">
            <Plus size={12} /> Añadir Ruta
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border max-h-[400px] overflow-y-auto" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
          <table className="w-full text-xs">
            <thead style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
              <tr>
                <th className="p-3 text-left font-mono font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Nodo Inicio (Source)</th>
                <th className="p-3 text-left font-mono font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Nodo Fin (Target)</th>
                <th className="p-3 text-center font-mono font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Costo/Distancia</th>
                <th className="p-3 text-center font-mono font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Capacidad</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.edges.map((e, i) => (
                <tr key={i} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-3">
                    <input 
                      value={e.source || ""} 
                      onChange={ev => updateEdge(i, 'source', ev.target.value)}
                      placeholder="Ej. Quito"
                      className={inputClass} 
                    />
                  </td>
                  <td className="p-3">
                    <input 
                      value={e.target || ""} 
                      onChange={ev => updateEdge(i, 'target', ev.target.value)}
                      placeholder="Ej. Guayaquil"
                      className={inputClass} 
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input 
                      type="number" 
                      value={e.weight} 
                      onChange={ev => updateEdge(i, 'weight', parseFloat(ev.target.value) || 0)}
                      className={`${inputClass} text-center font-semibold text-primary`} 
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input 
                      type="number" 
                      value={e.capacity} 
                      onChange={ev => updateEdge(i, 'capacity', parseFloat(ev.target.value) || 0)}
                      className={`${inputClass} text-center`} 
                    />
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => removeEdge(i)} className="text-muted-foreground hover:text-red-500 transition-colors p-1"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {data.edges.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground font-mono text-[11px]">
                    No hay rutas configuradas. Haz clic en "Añadir Ruta".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

