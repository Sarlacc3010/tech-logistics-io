import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface TransportEditorProps {
  jsonText: string;
  onChange: (val: string) => void;
  dark?: boolean;
}

interface TransportData {
  origins: string[];
  destinations: string[];
  supply: number[];
  demand: number[];
  costs: number[][];
}

export function TransportEditor({ jsonText, onChange, dark = true }: TransportEditorProps) {
  const [data, setData] = useState<TransportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize state from JSON
  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (
        parsed.origins && Array.isArray(parsed.origins) &&
        parsed.destinations && Array.isArray(parsed.destinations) &&
        parsed.supply && Array.isArray(parsed.supply) &&
        parsed.demand && Array.isArray(parsed.demand) &&
        parsed.costs && Array.isArray(parsed.costs)
      ) {
        setData(parsed);
        setError(null);
      } else {
        setError('El formato JSON no tiene la estructura de Transporte esperada.');
      }
    } catch (e) {
      // Don't overwrite state if they are typing invalid JSON externally, just show error
      setError('JSON inválido');
    }
  }, [jsonText]);

  // Sync state to parent JSON
  const syncToParent = (newData: TransportData) => {
    setData(newData);
    onChange(JSON.stringify(newData, null, 2));
  };

  if (error || !data) {
    return (
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-amber-500 mb-2">
          <AlertCircle size={14} />
          <span className="text-xs font-mono">Modo de Tabla no disponible para este formato. Usando editor de texto:</span>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
          className="w-full font-mono text-xs p-3 rounded border bg-black text-emerald-400 focus:outline-none"
          style={{ borderColor: error === 'JSON inválido' ? "#EF4444" : "rgba(255,255,255,0.1)" }}
        />
      </div>
    );
  }

  const handleCostChange = (oIdx: number, dIdx: number, val: string) => {
    const num = parseFloat(val) || 0;
    const newCosts = [...data.costs];
    newCosts[oIdx] = [...newCosts[oIdx]];
    newCosts[oIdx][dIdx] = num;
    syncToParent({ ...data, costs: newCosts });
  };

  const handleSupplyChange = (oIdx: number, val: string) => {
    const num = parseFloat(val) || 0;
    const newSupply = [...data.supply];
    newSupply[oIdx] = num;
    syncToParent({ ...data, supply: newSupply });
  };

  const handleDemandChange = (dIdx: number, val: string) => {
    const num = parseFloat(val) || 0;
    const newDemand = [...data.demand];
    newDemand[dIdx] = num;
    syncToParent({ ...data, demand: newDemand });
  };

  const handleOriginNameChange = (oIdx: number, val: string) => {
    const newOrigins = [...data.origins];
    newOrigins[oIdx] = val;
    syncToParent({ ...data, origins: newOrigins });
  };

  const handleDestNameChange = (dIdx: number, val: string) => {
    const newDests = [...data.destinations];
    newDests[dIdx] = val;
    syncToParent({ ...data, destinations: newDests });
  };

  const addOrigin = () => {
    const newOrigins = [...data.origins, `Nuevo Origen ${data.origins.length + 1}`];
    const newSupply = [...data.supply, 0];
    const newCosts = [...data.costs, new Array(data.destinations.length).fill(0)];
    syncToParent({ ...data, origins: newOrigins, supply: newSupply, costs: newCosts });
  };

  const removeOrigin = (idx: number) => {
    if (data.origins.length <= 1) return;
    const newOrigins = data.origins.filter((_, i) => i !== idx);
    const newSupply = data.supply.filter((_, i) => i !== idx);
    const newCosts = data.costs.filter((_, i) => i !== idx);
    syncToParent({ ...data, origins: newOrigins, supply: newSupply, costs: newCosts });
  };

  const addDestination = () => {
    const newDests = [...data.destinations, `Nuevo Dest. ${data.destinations.length + 1}`];
    const newDemand = [...data.demand, 0];
    const newCosts = data.costs.map(row => [...row, 0]);
    syncToParent({ ...data, destinations: newDests, demand: newDemand, costs: newCosts });
  };

  const removeDestination = (idx: number) => {
    if (data.destinations.length <= 1) return;
    const newDests = data.destinations.filter((_, i) => i !== idx);
    const newDemand = data.demand.filter((_, i) => i !== idx);
    const newCosts = data.costs.map(row => row.filter((_, i) => i !== idx));
    syncToParent({ ...data, destinations: newDests, demand: newDemand, costs: newCosts });
  };

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none text-center font-mono text-[11px] ${dark ? 'text-white' : 'text-black'}`;
  const headerInputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none text-center font-mono text-[11px] font-semibold text-muted-foreground`;

  const totalSupply = data.supply.reduce((a,b)=>a+b,0);
  const totalDemand = data.demand.reduce((a,b)=>a+b,0);
  const isBalanced = totalSupply === totalDemand;

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex justify-between items-center mb-4">
        <p className="text-xs text-muted-foreground font-mono">
          Edita la tabla. Las columnas son destinos y las filas orígenes.
        </p>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">Estado:</span>
            <span className={`text-[10px] font-mono font-bold ${isBalanced ? 'text-emerald-500' : 'text-amber-500'}`}>
              {isBalanced ? 'BALANCEADO' : 'DESBALANCEADO'}
            </span>
          </div>
        </div>
      </div>

      <div className="inline-block min-w-full border rounded-lg overflow-hidden" style={{ borderColor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }}>
        <table className="w-full text-xs">
          <thead style={{ background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}>
            <tr>
              <th className="p-3 border-r border-b text-left text-muted-foreground font-mono">
                Orígenes \ Destinos
              </th>
              {data.destinations.map((d, dIdx) => (
                <th key={dIdx} className="p-2 border-r border-b min-w-[100px] relative group">
                  <div className="flex items-center justify-center gap-1">
                    <input 
                      value={d} 
                      onChange={(e) => handleDestNameChange(dIdx, e.target.value)}
                      className={headerInputClass}
                      title="Nombre del destino"
                    />
                    <button onClick={() => removeDestination(dIdx)} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity p-1">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </th>
              ))}
              <th className="p-3 border-b font-mono text-primary font-bold min-w-[100px]">
                OFERTA (Supply)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.origins.map((o, oIdx) => (
              <tr key={oIdx} className="border-b transition-colors hover:bg-secondary/20" style={{ borderColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }}>
                <td className="p-2 border-r font-mono relative group">
                  <div className="flex items-center gap-2">
                    <button onClick={() => removeOrigin(oIdx)} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity p-1 shrink-0">
                      <Trash2 size={10} />
                    </button>
                    <input 
                      value={o} 
                      onChange={(e) => handleOriginNameChange(oIdx, e.target.value)}
                      className={headerInputClass}
                      style={{ textAlign: 'left' }}
                      title="Nombre del origen"
                    />
                  </div>
                </td>
                {data.destinations.map((_, dIdx) => (
                  <td key={dIdx} className="p-2 border-r text-center">
                    <div className="flex items-center justify-center">
                      <span className="text-muted-foreground mr-1 text-[10px]">$</span>
                      <input 
                        type="number"
                        value={data.costs[oIdx]?.[dIdx] ?? 0}
                        onChange={(e) => handleCostChange(oIdx, dIdx, e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </td>
                ))}
                <td className="p-2 text-center bg-primary/5">
                  <input 
                    type="number"
                    value={data.supply[oIdx] ?? 0}
                    onChange={(e) => handleSupplyChange(oIdx, e.target.value)}
                    className={`${inputClass} font-bold text-primary`}
                  />
                </td>
              </tr>
            ))}
            {/* Demanda Row */}
            <tr style={{ background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}>
              <td className="p-3 border-r font-mono text-primary font-bold text-right">
                DEMANDA (Demand)
              </td>
              {data.destinations.map((_, dIdx) => (
                <td key={dIdx} className="p-2 border-r text-center bg-primary/5">
                  <input 
                    type="number"
                    value={data.demand[dIdx] ?? 0}
                    onChange={(e) => handleDemandChange(dIdx, e.target.value)}
                    className={`${inputClass} font-bold text-primary`}
                  />
                </td>
              ))}
              <td className="p-3 text-center font-mono font-bold">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-muted-foreground leading-none mb-1">TOTAL</span>
                  <span className={isBalanced ? 'text-emerald-500' : 'text-amber-500'}>{totalSupply} / {totalDemand}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 mt-4">
        <button 
          onClick={addOrigin}
          className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border border-dashed transition-colors hover:bg-secondary/50"
          style={{ borderColor: dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)", color: dark ? "#fff" : "#000" }}
        >
          <Plus size={12} /> Agregar Origen (Fila)
        </button>
        <button 
          onClick={addDestination}
          className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border border-dashed transition-colors hover:bg-secondary/50"
          style={{ borderColor: dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)", color: dark ? "#fff" : "#000" }}
        >
          <Plus size={12} /> Agregar Destino (Columna)
        </button>
      </div>
    </div>
  );
}
