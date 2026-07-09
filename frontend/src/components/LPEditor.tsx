import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface LPEditorProps {
  jsonText: string;
  onChange: (val: string) => void;
  dark?: boolean;
}

interface LPVariable {
  name: string;
  objCoef: number;
  lowBound: number;
}

interface LPConstraint {
  name: string;
  operator: string;
  rhs: number;
  coefficients: Record<string, number>;
}

interface LPData {
  objective: "maximize" | "minimize";
  variables: LPVariable[];
  constraints: LPConstraint[];
}

export function LPEditor({ jsonText, onChange, dark = true }: LPEditorProps) {
  const [data, setData] = useState<LPData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.objective && Array.isArray(parsed.variables) && Array.isArray(parsed.constraints)) {
        setData(parsed);
        setError(null);
      } else {
        setError('Estructura de JSON inválida para Programación Lineal.');
      }
    } catch (e) {
      setError('JSON inválido');
    }
  }, [jsonText]);

  const sync = (newData: LPData) => {
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

  const addVariable = () => {
    const newName = `x${data.variables.length + 1}`;
    const newVars = [...data.variables, { name: newName, objCoef: 0, lowBound: 0 }];
    const newConsts = data.constraints.map(c => ({
      ...c,
      coefficients: { ...c.coefficients, [newName]: 0 }
    }));
    sync({ ...data, variables: newVars, constraints: newConsts });
  };

  const removeVariable = (idx: number) => {
    if (data.variables.length <= 1) return;
    const varName = data.variables[idx].name;
    const newVars = data.variables.filter((_, i) => i !== idx);
    const newConsts = data.constraints.map(c => {
      const newCoefs = { ...c.coefficients };
      delete newCoefs[varName];
      return { ...c, coefficients: newCoefs };
    });
    sync({ ...data, variables: newVars, constraints: newConsts });
  };

  const addConstraint = () => {
    const newCoefs: Record<string, number> = {};
    data.variables.forEach(v => newCoefs[v.name] = 0);
    const newConsts = [...data.constraints, { name: `C${data.constraints.length + 1}`, operator: "<=", rhs: 0, coefficients: newCoefs }];
    sync({ ...data, constraints: newConsts });
  };

  const removeConstraint = (idx: number) => {
    const newConsts = data.constraints.filter((_, i) => i !== idx);
    sync({ ...data, constraints: newConsts });
  };

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`;

  return (
    <div className="p-4 flex flex-col gap-6">
      {/* Objective */}
      <div className="flex items-center gap-4 border-b pb-4" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Objetivo:</span>
        <select 
          value={data.objective} 
          onChange={e => sync({ ...data, objective: e.target.value as "maximize" | "minimize" })}
          className="bg-transparent border border-muted-foreground/30 rounded px-3 py-1.5 text-xs font-semibold focus:outline-none"
        >
          <option value="maximize">Maximizar (Maximize)</option>
          <option value="minimize">Minimizar (Minimize)</option>
        </select>
      </div>

      {/* Variables */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Variables de Decisión</span>
          <button onClick={addVariable} className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors">
            <Plus size={12} /> Agregar Variable
          </button>
        </div>
        <div className="overflow-x-auto rounded border" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
          <table className="w-full text-xs">
            <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
              <tr>
                <th className="p-2 text-left font-mono font-medium text-muted-foreground">Variable</th>
                <th className="p-2 text-left font-mono font-medium text-muted-foreground">Coef. Función Objetivo</th>
                <th className="p-2 text-left font-mono font-medium text-muted-foreground">Límite Inf. (LowBound)</th>
                <th className="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.variables.map((v, i) => (
                <tr key={i} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-2">
                    <input 
                      value={v.name} 
                      onChange={e => {
                        const newVars = [...data.variables];
                        const oldName = newVars[i].name;
                        newVars[i].name = e.target.value;
                        const newConsts = data.constraints.map(c => {
                          const newCoefs = { ...c.coefficients };
                          newCoefs[e.target.value] = newCoefs[oldName] || 0;
                          if(e.target.value !== oldName) delete newCoefs[oldName];
                          return { ...c, coefficients: newCoefs };
                        });
                        sync({ ...data, variables: newVars, constraints: newConsts });
                      }}
                      className={inputClass} 
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      type="number" 
                      value={v.objCoef} 
                      onChange={e => {
                        const newVars = [...data.variables];
                        newVars[i].objCoef = parseFloat(e.target.value) || 0;
                        sync({ ...data, variables: newVars });
                      }}
                      className={inputClass} 
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      type="number" 
                      value={v.lowBound} 
                      onChange={e => {
                        const newVars = [...data.variables];
                        newVars[i].lowBound = parseFloat(e.target.value) || 0;
                        sync({ ...data, variables: newVars });
                      }}
                      className={inputClass} 
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button onClick={() => removeVariable(i)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Constraints */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Restricciones</span>
          <button onClick={addConstraint} className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors">
            <Plus size={12} /> Agregar Restricción
          </button>
        </div>
        <div className="overflow-x-auto rounded border" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
          <table className="w-full text-xs">
            <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
              <tr>
                <th className="p-2 text-left font-mono font-medium text-muted-foreground min-w-[120px]">Nombre</th>
                {data.variables.map(v => (
                  <th key={v.name} className="p-2 text-center font-mono font-medium text-primary bg-primary/5">{v.name}</th>
                ))}
                <th className="p-2 text-center font-mono font-medium text-muted-foreground">Operador</th>
                <th className="p-2 text-center font-mono font-medium text-muted-foreground">RHS</th>
                <th className="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.constraints.map((c, i) => (
                <tr key={i} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-2">
                    <input 
                      value={c.name} 
                      onChange={e => {
                        const newC = [...data.constraints];
                        newC[i].name = e.target.value;
                        sync({ ...data, constraints: newC });
                      }}
                      className={inputClass} 
                    />
                  </td>
                  {data.variables.map(v => (
                    <td key={v.name} className="p-2 bg-primary/5">
                      <input 
                        type="number"
                        value={c.coefficients[v.name] ?? 0}
                        onChange={e => {
                          const newC = [...data.constraints];
                          newC[i].coefficients = { ...newC[i].coefficients, [v.name]: parseFloat(e.target.value) || 0 };
                          sync({ ...data, constraints: newC });
                        }}
                        className={`${inputClass} text-center`}
                      />
                    </td>
                  ))}
                  <td className="p-2">
                    <select 
                      value={c.operator}
                      onChange={e => {
                        const newC = [...data.constraints];
                        newC[i].operator = e.target.value;
                        sync({ ...data, constraints: newC });
                      }}
                      className="w-full bg-transparent border-b border-transparent focus:outline-none text-center font-mono text-xs"
                    >
                      <option value="<=">&le;</option>
                      <option value="=">=</option>
                      <option value=">=">&ge;</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <input 
                      type="number"
                      value={c.rhs}
                      onChange={e => {
                        const newC = [...data.constraints];
                        newC[i].rhs = parseFloat(e.target.value) || 0;
                        sync({ ...data, constraints: newC });
                      }}
                      className={`${inputClass} text-center`}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button onClick={() => removeConstraint(i)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
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
