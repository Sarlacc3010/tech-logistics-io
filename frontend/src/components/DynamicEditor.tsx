import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface DynamicEditorProps {
  jsonText: string;
  onChange: (val: string) => void;
  dark?: boolean;
}

interface DynamicData {
  initialState: number;
  stages: number;
  states: number[];
  decisions: number[];
  costs: Record<string, number>;
}

export function DynamicEditor({ jsonText, onChange, dark = true }: DynamicEditorProps) {
  const [data, setData] = useState<DynamicData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed.initialState === 'number' && Array.isArray(parsed.states) && parsed.costs) {
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

  const handleArrayChange = (field: 'states' | 'decisions', value: string) => {
    // Parse comma-separated numbers
    const nums = value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    
    let newCosts = { ...data.costs };
    if (field === 'states') {
      nums.forEach(n => {
        if (newCosts[n.toString()] === undefined) newCosts[n.toString()] = 0;
      });
    }

    sync({ ...data, [field]: nums, costs: newCosts });
  };

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`;
  
  return (
    <div className="p-4 flex flex-col gap-6">
      
      {/* Basic Settings */}
      <div className="grid grid-cols-2 gap-6 pb-6 border-b" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Estado Inicial</label>
          <input 
            type="number" 
            value={data.initialState}
            onChange={e => sync({ ...data, initialState: parseInt(e.target.value) || 0 })}
            className={`${inputClass} text-xl p-2 border rounded bg-secondary/10`}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Número de Etapas</label>
          <input 
            type="number" 
            value={data.stages}
            onChange={e => sync({ ...data, stages: parseInt(e.target.value) || 0 })}
            className={`${inputClass} text-xl p-2 border rounded bg-secondary/10`}
          />
        </div>
      </div>

      {/* Vectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Espacio de Estados (Separados por coma)</label>
          <input 
            type="text" 
            value={data.states.join(', ')}
            onChange={e => handleArrayChange('states', e.target.value)}
            className={`${inputClass} p-2 border rounded bg-secondary/10`}
            placeholder="ej: 0, 50, 100"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Espacio de Decisiones (Separados por coma)</label>
          <input 
            type="text" 
            value={data.decisions.join(', ')}
            onChange={e => handleArrayChange('decisions', e.target.value)}
            className={`${inputClass} p-2 border rounded bg-secondary/10`}
            placeholder="ej: 0, 50, 100"
          />
        </div>
      </div>

      {/* Costs Map */}
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Costos por Estado</label>
        <div className="overflow-x-auto rounded border" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
          <table className="w-full text-xs">
            <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
              <tr>
                <th className="p-2 text-center font-mono font-medium text-muted-foreground border-r w-1/2">Estado (s)</th>
                <th className="p-2 text-center font-mono font-medium text-muted-foreground">Costo C(s)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.states.map((s, i) => (
                <tr key={i} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-2 text-center font-mono font-semibold border-r">{s}</td>
                  <td className="p-2">
                    <input 
                      type="number" 
                      value={data.costs[s.toString()] ?? 0}
                      onChange={e => {
                        const newCosts = { ...data.costs, [s.toString()]: parseFloat(e.target.value) || 0 };
                        sync({ ...data, costs: newCosts });
                      }}
                      className={`${inputClass} text-center`} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
