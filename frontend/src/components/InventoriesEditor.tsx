import React, { useState, useEffect } from 'react';
import { AlertCircle, Package, Plus, Trash2 } from 'lucide-react';

interface InventoriesEditorProps {
  jsonText: string;
  onChange: (val: string) => void;
  dark?: boolean;
}

type CalcType = "eoq" | "eoq_discounts" | "eoq_backorders" | "epq" | "reorder_point" | "abc";

interface InventoriesData {
  calc_type: CalcType;
  parameters: Record<string, any>;
}

const CALC_TYPE_LABELS: Record<CalcType, string> = {
  eoq: "EOQ Básico",
  eoq_discounts: "EOQ con Descuentos por Cantidad",
  eoq_backorders: "EOQ con Faltantes Permitidos",
  epq: "Lote Económico de Producción (EPQ)",
  reorder_point: "Punto de Reorden",
  abc: "Clasificación ABC",
};

const NUMERIC_FIELDS: Record<string, { key: string; label: string }[]> = {
  eoq: [
    { key: 'annual_demand', label: 'Demanda anual (D)' },
    { key: 'setup_cost', label: 'Costo de pedido (S)' },
    { key: 'holding_cost', label: 'Costo de mantener (H)' },
    { key: 'lead_time_days', label: 'Tiempo de entrega (días)' },
    { key: 'service_level_z', label: 'Nivel de servicio (Z)' },
    { key: 'demand_std_dev', label: 'Desv. estándar de la demanda' },
  ],
  eoq_backorders: [
    { key: 'annual_demand', label: 'Demanda anual (D)' },
    { key: 'setup_cost', label: 'Costo de pedido (S)' },
    { key: 'holding_cost', label: 'Costo de mantener (H)' },
    { key: 'backorder_cost', label: 'Costo de faltante (B)' },
  ],
  epq: [
    { key: 'annual_demand', label: 'Demanda anual (D)' },
    { key: 'setup_cost', label: 'Costo de pedido (S)' },
    { key: 'holding_cost', label: 'Costo de mantener (H)' },
    { key: 'production_rate', label: 'Tasa de producción (P)' },
  ],
  reorder_point: [
    { key: 'daily_demand', label: 'Demanda diaria' },
    { key: 'lead_time_days', label: 'Tiempo de entrega (días)' },
    { key: 'service_level_z', label: 'Nivel de servicio (Z)' },
    { key: 'demand_std_dev', label: 'Desv. estándar de la demanda' },
  ],
  eoq_discounts: [
    { key: 'annual_demand', label: 'Demanda anual (D)' },
    { key: 'setup_cost', label: 'Costo de pedido (S)' },
    { key: 'holding_cost_rate', label: 'Tasa de mantenimiento (fracción del precio)' },
  ],
};

const DEFAULT_PARAMETERS: Record<CalcType, Record<string, any>> = {
  eoq: { annual_demand: 1000, setup_cost: 50, holding_cost: 2, lead_time_days: 7, service_level_z: 1.65, demand_std_dev: 0 },
  eoq_discounts: { annual_demand: 1000, setup_cost: 50, holding_cost_rate: 0.2, price_breaks: [{ min_qty: 0, unit_price: 5 }] },
  eoq_backorders: { annual_demand: 1000, setup_cost: 50, holding_cost: 2, backorder_cost: 5 },
  epq: { annual_demand: 1000, setup_cost: 50, holding_cost: 2, production_rate: 4000 },
  reorder_point: { daily_demand: 10, lead_time_days: 7, service_level_z: 1.65, demand_std_dev: 0 },
  abc: { skus: [{ sku: "SKU-001", unit_cost: 10, annual_usage: 100 }] },
};

export function InventoriesEditor({ jsonText, onChange, dark = true }: InventoriesEditorProps) {
  const [data, setData] = useState<InventoriesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed.calc_type === 'string' && parsed.parameters && typeof parsed.parameters === 'object') {
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

  const handleCalcTypeChange = (calc_type: CalcType) => {
    sync({ calc_type, parameters: DEFAULT_PARAMETERS[calc_type] });
  };

  const setParam = (key: string, value: number) => {
    sync({ ...data, parameters: { ...data.parameters, [key]: value } });
  };

  const inputClass = `w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-lg text-right ${dark ? 'text-white' : 'text-black'}`;
  const cardClass = `p-4 rounded-xl border flex items-center justify-between transition-colors hover:bg-secondary/20`;
  const borderColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  const priceBreaks: { min_qty: number; unit_price: number }[] = Array.isArray(data.parameters.price_breaks) ? data.parameters.price_breaks : [];
  const skus: { sku: string; unit_cost: number; annual_usage: number }[] = Array.isArray(data.parameters.skus) ? data.parameters.skus : [];

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header + calc_type selector */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
          <Package size={24} />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Modelo de Inventario</label>
          <select
            value={data.calc_type}
            onChange={e => handleCalcTypeChange(e.target.value as CalcType)}
            className="block w-full bg-transparent border-none focus:outline-none font-mono text-xl font-bold"
          >
            {Object.entries(CALC_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Numeric fields grid (todos los calc_types excepto abc) */}
      {NUMERIC_FIELDS[data.calc_type] && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {NUMERIC_FIELDS[data.calc_type].map(f => (
            <div key={f.key} className={cardClass} style={{ borderColor }}>
              <p className="text-xs font-semibold text-muted-foreground">{f.label}</p>
              <div className="w-28">
                <input
                  type="number"
                  value={data.parameters[f.key] ?? 0}
                  onChange={e => setParam(f.key, parseFloat(e.target.value) || 0)}
                  className={inputClass}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Price breaks (solo eoq_discounts) */}
      {data.calc_type === 'eoq_discounts' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Niveles de Precio por Cantidad</span>
            <button
              onClick={() => sync({ ...data, parameters: { ...data.parameters, price_breaks: [...priceBreaks, { min_qty: 0, unit_price: 0 }] } })}
              className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors"
            >
              <Plus size={12} /> Agregar Nivel
            </button>
          </div>
          <div className="overflow-x-auto rounded border" style={{ borderColor }}>
            <table className="w-full text-xs">
              <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                <tr>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Cantidad Mínima</th>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Precio Unitario</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {priceBreaks.map((pb, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-2">
                      <input
                        type="number"
                        value={pb.min_qty}
                        onChange={e => {
                          const next = [...priceBreaks];
                          next[i] = { ...next[i], min_qty: parseFloat(e.target.value) || 0 };
                          sync({ ...data, parameters: { ...data.parameters, price_breaks: next } });
                        }}
                        className={`w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={pb.unit_price}
                        onChange={e => {
                          const next = [...priceBreaks];
                          next[i] = { ...next[i], unit_price: parseFloat(e.target.value) || 0 };
                          sync({ ...data, parameters: { ...data.parameters, price_breaks: next } });
                        }}
                        className={`w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => sync({ ...data, parameters: { ...data.parameters, price_breaks: priceBreaks.filter((_, idx) => idx !== i) } })}
                        className="text-red-500 hover:text-red-400 p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SKUs table (solo abc) */}
      {data.calc_type === 'abc' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">SKUs</span>
            <button
              onClick={() => sync({ ...data, parameters: { ...data.parameters, skus: [...skus, { sku: `SKU-${skus.length + 1}`, unit_cost: 0, annual_usage: 0 }] } })}
              className="flex items-center gap-1 text-[10px] font-mono border px-2 py-1 rounded hover:bg-secondary/50 transition-colors"
            >
              <Plus size={12} /> Agregar SKU
            </button>
          </div>
          <div className="overflow-x-auto rounded border" style={{ borderColor }}>
            <table className="w-full text-xs">
              <thead style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                <tr>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">SKU</th>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Costo Unitario</th>
                  <th className="p-2 text-left font-mono font-medium text-muted-foreground">Uso Anual</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {skus.map((s, i) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-2">
                      <input
                        value={s.sku}
                        onChange={e => {
                          const next = [...skus];
                          next[i] = { ...next[i], sku: e.target.value };
                          sync({ ...data, parameters: { ...data.parameters, skus: next } });
                        }}
                        className={`w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={s.unit_cost}
                        onChange={e => {
                          const next = [...skus];
                          next[i] = { ...next[i], unit_cost: parseFloat(e.target.value) || 0 };
                          sync({ ...data, parameters: { ...data.parameters, skus: next } });
                        }}
                        className={`w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={s.annual_usage}
                        onChange={e => {
                          const next = [...skus];
                          next[i] = { ...next[i], annual_usage: parseFloat(e.target.value) || 0 };
                          sync({ ...data, parameters: { ...data.parameters, skus: next } });
                        }}
                        className={`w-full bg-transparent border-b border-transparent focus:border-amber-500 focus:outline-none font-mono text-xs ${dark ? 'text-white' : 'text-black'}`}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => sync({ ...data, parameters: { ...data.parameters, skus: skus.filter((_, idx) => idx !== i) } })}
                        className="text-red-500 hover:text-red-400 p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
