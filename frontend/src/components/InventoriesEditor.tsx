import React, { useState, useEffect } from 'react';
import { AlertCircle, Package, TrendingUp, DollarSign, Clock, Settings } from 'lucide-react';

interface InventoriesEditorProps {
  jsonText: string;
  onChange: (val: string) => void;
  dark?: boolean;
}

interface InventoriesData {
  sku: string;
  demandRate: number;
  setupCost: number;
  holdingCost: number;
  leadTime: number;
}

export function InventoriesEditor({ jsonText, onChange, dark = true }: InventoriesEditorProps) {
  const [data, setData] = useState<InventoriesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.sku && typeof parsed.demandRate === 'number') {
        setData(parsed);
        setError(null);
      } else {
        setError('Estructura de JSON inválida para Inventarios.');
      }
    } catch (e) {
      setError('JSON inválido');
    }
  }, [jsonText]);

  const sync = (newData: InventoriesData) => {
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

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-lg text-right ${dark ? 'text-white' : 'text-black'}`;
  const cardClass = `p-4 rounded-xl border flex items-center justify-between transition-colors hover:bg-secondary/20`;
  
  return (
    <div className="p-6">
      
      {/* SKU Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
          <Package size={24} />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Código de Producto (SKU)</label>
          <input 
            type="text" 
            value={data.sku}
            onChange={e => sync({ ...data, sku: e.target.value })}
            className={`block w-full bg-transparent border-none focus:outline-none font-mono text-2xl font-bold ${dark ? 'text-white' : 'text-black'}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Demand Rate */}
        <div className={cardClass} style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-500">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Tasa de Demanda</p>
              <p className="text-[10px] text-muted-foreground font-mono">Unidades / periodo</p>
            </div>
          </div>
          <div className="w-24">
            <input 
              type="number" 
              value={data.demandRate}
              onChange={e => sync({ ...data, demandRate: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
        </div>

        {/* Setup Cost */}
        <div className={cardClass} style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500">
              <Settings size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Costo de Pedido (K)</p>
              <p className="text-[10px] text-muted-foreground font-mono">$ por orden</p>
            </div>
          </div>
          <div className="w-24 flex items-center">
            <DollarSign size={14} className="text-muted-foreground" />
            <input 
              type="number" 
              value={data.setupCost}
              onChange={e => sync({ ...data, setupCost: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
        </div>

        {/* Holding Cost */}
        <div className={cardClass} style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-500">
              <DollarSign size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Costo de Almacenaje (h)</p>
              <p className="text-[10px] text-muted-foreground font-mono">$ / unidad / periodo</p>
            </div>
          </div>
          <div className="w-24 flex items-center">
            <DollarSign size={14} className="text-muted-foreground" />
            <input 
              type="number" 
              value={data.holdingCost}
              onChange={e => sync({ ...data, holdingCost: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
        </div>

        {/* Lead Time */}
        <div className={cardClass} style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10 text-purple-500">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Tiempo de Entrega (L)</p>
              <p className="text-[10px] text-muted-foreground font-mono">Días (Lead time)</p>
            </div>
          </div>
          <div className="w-24">
            <input 
              type="number" 
              value={data.leadTime}
              onChange={e => sync({ ...data, leadTime: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
