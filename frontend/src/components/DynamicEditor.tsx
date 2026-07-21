import React, { useState, useEffect } from 'react';
import { AlertCircle, Layers, Plus, Trash2 } from 'lucide-react';

interface DynamicEditorProps {
  jsonText: string;
  onChange: (val: string) => void;
  dark?: boolean;
}

type ProblemType = "knapsack" | "lot_sizing";

interface DynamicData {
  problem_type: ProblemType;
  parameters: Record<string, any>;
}

const PROBLEM_TYPE_LABELS: Record<ProblemType, string> = {
  knapsack: "Mochila (Knapsack 0/1)",
  lot_sizing: "Tamaño de Lote (Wagner-Whitin)",
};

const DEFAULT_PARAMETERS: Record<ProblemType, Record<string, any>> = {
  knapsack: {
    weights: [2, 3, 4],
    values: [3, 4, 5],
    capacity: 5,
  },
  lot_sizing: {
    demands: [10, 20, 15],
    setup_cost: 100,
    holding_cost: 2,
  },
};

export function DynamicEditor({ jsonText, onChange, dark = true }: DynamicEditorProps) {
  const [data, setData] = useState<DynamicData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed.problem_type === 'string' && parsed.parameters && typeof parsed.parameters === 'object') {
        setData(parsed);
        setError(null);
      } else {
        setError('Estructura de JSON inválida para Prog. Dinámica.');
      }
    } catch (e) {
      setError('JSON inválido');
    }
  }, [jsonText]);

  const sync = (newData: DynamicData) => {
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

  const handleTypeChange = (problem_type: ProblemType) => {
    sync({ problem_type, parameters: DEFAULT_PARAMETERS[problem_type] });
  };

  const setParam = (key: string, value: number) => {
    sync({ ...data, parameters: { ...data.parameters, [key]: value } });
  };

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`;
  const cardClass = `p-4 rounded-xl border flex items-center justify-between transition-colors hover:bg-secondary/20`;
  const borderColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  const weights: number[] = Array.isArray(data.parameters.weights) ? data.parameters.weights : [];
  const values: number[] = Array.isArray(data.parameters.values) ? data.parameters.values : [];
  const demands: number[] = Array.isArray(data.parameters.demands) ? data.parameters.demands : [];

  const addItem = () => {
    sync({
      ...data,
      parameters: {
        ...data.parameters,
        weights: [...weights, 1],
        values: [...values, 1],
      },
    });
  };

  const removeItem = (idx: number) => {
    sync({
      ...data,
      parameters: {
        ...data.parameters,
        weights: weights.filter((_, i) => i !== idx),
        values: values.filter((_, i) => i !== idx),
      },
    });
  };

  const updateItem = (idx: number, field: 'weights' | 'values', value: number) => {
    const arr = field === 'weights' ? [...weights] : [...values];
    arr[idx] = value;
    sync({ ...data, parameters: { ...data.parameters, [field]: arr } });
  };

  const addPeriod = () => {
    sync({ ...data, parameters: { ...data.parameters, demands: [...demands, 0] } });
  };

  const removePeriod = (idx: number) => {
    sync({ ...data, parameters: { ...data.parameters, demands: demands.filter((_, i) => i !== idx) } });
  };

  const updateDemand = (idx: number, value: number) => {
    const next = [...demands];
    next[idx] = value;
    sync({ ...data, parameters: { ...data.parameters, demands: next } });
  };

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header + problem_type selector */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
          <Layers size={24} />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tipo de Problema</label>
          <select
            value={data.problem_type}
            onChange={e => handleTypeChange(e.target.value as ProblemType)}
            className="block w-full bg-transparent border-none focus:outline-none font-mono text-xl font-bold"
          >
            {Object.entries(PROBLEM_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {data.problem_type === 'knapsack' && (
        <>
          <div className={cardClass} style={{ borderColor }}>
            <p className="text-xs font-semibold text-muted-foreground">Capacidad de la mochila</p>
            <div className="w-28">
              <input
                type="number"
                value={data.parameters.capacity ?? 0}
                onChange={e => setParam('capacity', parseFloat(e.target.value) || 0)}
                className={`${inputClass} text-lg text-right`}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Objetos (peso / valor)</span>
              <button onClick={addItem} className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors">
                <Plus size={12} /> Agregar Objeto
              </button>
            </div>
            <div className="overflow-x-auto rounded border" style={{ borderColor }}>
              <table className="w-full text-xs">
                <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                  <tr>
                    <th className="p-2 text-left font-mono font-medium text-muted-foreground">Objeto</th>
                    <th className="p-2 text-center font-mono font-medium text-muted-foreground">Peso</th>
                    <th className="p-2 text-center font-mono font-medium text-muted-foreground">Valor</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {weights.map((w, i) => (
                    <tr key={i} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-2 font-mono font-semibold text-muted-foreground">#{i + 1}</td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={w}
                          onChange={e => updateItem(i, 'weights', parseFloat(e.target.value) || 0)}
                          className={`${inputClass} text-center`}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={values[i] ?? 0}
                          onChange={e => updateItem(i, 'values', parseFloat(e.target.value) || 0)}
                          className={`${inputClass} text-center`}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {data.problem_type === 'lot_sizing' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={cardClass} style={{ borderColor }}>
              <p className="text-xs font-semibold text-muted-foreground">Costo de preparación (S)</p>
              <div className="w-28">
                <input
                  type="number"
                  value={data.parameters.setup_cost ?? 0}
                  onChange={e => setParam('setup_cost', parseFloat(e.target.value) || 0)}
                  className={`${inputClass} text-lg text-right`}
                />
              </div>
            </div>
            <div className={cardClass} style={{ borderColor }}>
              <p className="text-xs font-semibold text-muted-foreground">Costo de mantener (H) por período</p>
              <div className="w-28">
                <input
                  type="number"
                  value={data.parameters.holding_cost ?? 0}
                  onChange={e => setParam('holding_cost', parseFloat(e.target.value) || 0)}
                  className={`${inputClass} text-lg text-right`}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Demanda por período</span>
              <button onClick={addPeriod} className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors">
                <Plus size={12} /> Agregar Período
              </button>
            </div>
            <div className="overflow-x-auto rounded border" style={{ borderColor }}>
              <table className="w-full text-xs">
                <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                  <tr>
                    <th className="p-2 text-left font-mono font-medium text-muted-foreground">Período</th>
                    <th className="p-2 text-center font-mono font-medium text-muted-foreground">Demanda</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {demands.map((d, i) => (
                    <tr key={i} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-2 font-mono font-semibold text-muted-foreground">{i + 1}</td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={d}
                          onChange={e => updateDemand(i, parseFloat(e.target.value) || 0)}
                          className={`${inputClass} text-center`}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => removePeriod(i)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
