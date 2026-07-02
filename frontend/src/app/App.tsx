import { useState, useRef, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend,
  ScatterChart, Scatter, ReferenceLine,
} from "recharts";
import {
  Sun, Moon, TrendingUp, Truck, Network, GitBranch, Layers, Package,
  LayoutDashboard, MessageSquare, X, Send, Bell, Search, Settings,
  ChevronRight, Download, RefreshCw, Filter, MapPin, Activity,
  ArrowUpRight, ArrowDownRight, Brain, Zap, Menu, Globe,
  AlertTriangle, CheckCircle2, Clock, Info, ChevronDown,
  ChevronsLeft, ChevronsRight, Terminal,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ModuleId = "overview" | "lp" | "transport" | "networks" | "ip" | "dp" | "inventories";

interface Module {
  id: ModuleId;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  description: string;
  badge?: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const MODULES: Module[] = [
  { id: "overview",    label: "Panel de Control",         shortLabel: "Resumen",     icon: LayoutDashboard, description: "KPIs globales y operaciones en vivo" },
  { id: "lp",         label: "Programación Lineal",      shortLabel: "PL",          icon: TrendingUp,      description: "Método Simplex y análisis dual" },
  { id: "transport",  label: "Modelo de Transporte",     shortLabel: "Transporte",  icon: Truck,           description: "Optimización de rutas y transportistas", badge: "3" },
  { id: "networks",   label: "Modelos de Redes",         shortLabel: "Redes",       icon: Network,         description: "Flujo de costo mínimo y enrutamiento" },
  { id: "ip",         label: "Programación Entera",      shortLabel: "PE / MIP",    icon: GitBranch,       description: "Algoritmo Branch & Bound" },
  { id: "dp",         label: "Programación Dinámica",    shortLabel: "PD",          icon: Layers,          description: "Ecuaciones de Bellman y etapas" },
  { id: "inventories",label: "Control de Inventarios",   shortLabel: "Inventarios", icon: Package,         description: "Lote Económico (EOQ) y análisis ABC", badge: "Nuevo" },
];

// ─── Data ────────────────────────────────────────────────────────────────────

const shipmentTrend = [
  { month: "Ene", volume: 8420, revenue: 2140, cost: 1680 },
  { month: "Feb", volume: 9310, revenue: 2390, cost: 1820 },
  { month: "Mar", volume: 8890, revenue: 2280, cost: 1750 },
  { month: "Abr", volume: 10450, revenue: 2760, cost: 1940 },
  { month: "May", volume: 11200, revenue: 2980, cost: 2010 },
  { month: "Jun", volume: 10800, revenue: 2850, cost: 1970 },
  { month: "Jul", volume: 12340, revenue: 3280, cost: 2150 },
  { month: "Ago", volume: 11760, revenue: 3110, cost: 2090 },
];

const perfRadar = [
  { metric: "A Tiempo", score: 94 },
  { metric: "Tasa Relleno", score: 88 },
  { metric: "Utilización", score: 79 },
  { metric: "Precisión", score: 96 },
  { metric: "Ef. Costo", score: 83 },
  { metric: "Resiliencia", score: 71 },
];

const lpSolution = [
  { variable: "x₁ (Producto A)", value: 24.00, reducedCost: 0.00, lower: 18.0, upper: "∞" },
  { variable: "x₂ (Producto B)", value: 36.00, reducedCost: 0.00, lower: 0.0,  upper: 48.0 },
  { variable: "x₃ (Producto C)", value: 0.00,  reducedCost: -1.20, lower: "-∞", upper: 12.0 },
];
const lpConstraints = [
  { name: "Horas Mano Obra", slack: 0.00,  shadowPrice: 0.840, rhsLow: 210.0, rhsHigh: 265.0 },
  { name: "Materia Prima",   slack: 12.50, shadowPrice: 0.000, rhsLow: 245.0, rhsHigh: "∞"   },
  { name: "Horas Máquina",   slack: 0.00,  shadowPrice: 0.320, rhsLow: 390.0, rhsHigh: 445.0 },
];
const lpSensChart = [
  { constraint: "Mano Obra", current: 240, lower: 210, upper: 265 },
  { constraint: "Mat. Prima",current: 270, lower: 245, upper: 320 },
  { constraint: "Maquinaria",current: 420, lower: 390, upper: 445 },
];

const costMatrix = [
  { origin: "Seattle (S1)",  denver: 12, chicago: 18, miami: 28, newYork: 22, supply: 180 },
  { origin: "Dallas (S2)",   denver:  9, chicago: 14, miami: 16, newYork: 24, supply: 240 },
  { origin: "Atlanta (S3)",  denver: 20, chicago: 11, miami:  8, newYork: 13, supply: 160 },
  { origin: "Demanda",       denver: 140, chicago: 160, miami: 120, newYork: 160, supply: null },
];
const transportPlan = [
  { route: "Seattle → Denver",   units: 140, cost: 1680, pct: 78, status: "Óptimo" },
  { route: "Seattle → Chicago",  units:  40, cost:  720, pct: 22, status: "Óptimo" },
  { route: "Dallas → Chicago",   units: 120, cost: 1680, pct: 50, status: "Óptimo" },
  { route: "Dallas → New York",  units: 120, cost: 2880, pct: 50, status: "Óptimo" },
  { route: "Atlanta → Miami",    units: 120, cost:  960, pct: 75, status: "Óptimo" },
  { route: "Atlanta → New York", units:  40, cost:  520, pct: 25, status: "Subóptimo" },
];

const networkNodes = [
  { node: "Nodo 1 (Origen A)", excess: 200, flow_out: 200, flow_in: 0,   type: "Fuente" },
  { node: "Nodo 2 (Origen B)", excess: 150, flow_out: 150, flow_in: 0,   type: "Fuente" },
  { node: "Nodo 3 (Transb.)",  excess: 0,   flow_out: 180, flow_in: 180, type: "Transbordo" },
  { node: "Nodo 4 (Transb.)",  excess: 0,   flow_out: 170, flow_in: 170, type: "Transbordo" },
  { node: "Nodo 5 (Destino A)",excess: -170, flow_out: 0,  flow_in: 170, type: "Sumidero" },
  { node: "Nodo 6 (Destino B)",excess: -180, flow_out: 0,  flow_in: 180, type: "Sumidero" },
];
const networkFlow = [
  { t: "T1", flowA: 145, flowB: 132, capacity: 200 },
  { t: "T2", flowA: 178, flowB: 148, capacity: 200 },
  { t: "T3", flowA: 192, flowB: 165, capacity: 200 },
  { t: "T4", flowA: 180, flowB: 172, capacity: 200 },
  { t: "T5", flowA: 188, flowB: 168, capacity: 200 },
  { t: "T6", flowA: 195, flowB: 180, capacity: 200 },
];

const mipSolutions = [
  { scenario: "Relajación LP", obj: 4820.40, x1: 14.2, x2: 8.6, x3: 5.1, x4: 11.8, gap: "—" },
  { scenario: "Solución IP",   obj: 4740.00, x1: 14,   x2: 8,   x3: 5,   x4: 12,   gap: "1.71%" },
  { scenario: "Cota Superior", obj: 4812.00, x1: "—",  x2: "—", x3: "—", x4: "—",  gap: "1.52%" },
];
const branchProgress = [
  { iter: 1, bound: 4820.40, incumbent: 0,       nodes: 1  },
  { iter: 2, bound: 4810.20, incumbent: 4680.00, nodes: 4  },
  { iter: 3, bound: 4798.50, incumbent: 4710.00, nodes: 9  },
  { iter: 4, bound: 4780.10, incumbent: 4730.00, nodes: 16 },
  { iter: 5, bound: 4760.00, incumbent: 4740.00, nodes: 23 },
  { iter: 6, bound: 4740.00, incumbent: 4740.00, nodes: 27 },
];

const dpStages = [
  { stage: "Período 1", state: "Inicio", decision: "Ordenar 200 unidades", value: 0,     cumCost: 0      },
  { stage: "Período 2", state: "s=200",  decision: "Ordenar 0 unidades",   value: 480,   cumCost: 1200   },
  { stage: "Período 3", state: "s=80",   decision: "Ordenar 150 unidades", value: 1040,  cumCost: 2640   },
  { stage: "Período 4", state: "s=130",  decision: "Ordenar 0 unidades",   value: 1560,  cumCost: 3900   },
  { stage: "Período 5", state: "s=30",   decision: "Ordenar 200 unidades", value: 2080,  cumCost: 5200   },
  { stage: "Período 6", state: "s=180",  decision: "Ordenar 0 unidades",   value: 2480,  cumCost: 6200   },
];
const dpValueFn = [
  { state: 0,   v1: 0,    v2: 480,  v3: 820  },
  { state: 50,  v1: 120,  v2: 540,  v3: 880  },
  { state: 100, v1: 240,  v2: 610,  v3: 950  },
  { state: 150, v1: 360,  v2: 690,  v3: 1020 },
  { state: 200, v1: 480,  v2: 780,  v3: 1100 },
];

const inventoryData = [
  { sku: "TL-A0041", desc: "Bomba Hidráulica",     abc: "A", qty: 142,  reorder: 200, eoq: 380, safety: 60,  leadTime: "7d",  status: "Reordenar", velocity: 28.4 },
  { sku: "TL-B0128", desc: "Módulo Control 5X",    abc: "A", qty: 516,  reorder: 300, eoq: 520, safety: 80,  leadTime: "14d", status: "OK",        velocity: 21.1 },
  { sku: "TL-B0219", desc: "Arreglo Sensores v2",  abc: "B", qty: 88,   reorder: 150, eoq: 240, safety: 40,  leadTime: "10d", status: "Crítico",   velocity: 14.8 },
  { sku: "TL-C0334", desc: "Juego Empaques 12mm",  abc: "B", qty: 1240, reorder: 500, eoq: 900, safety: 120, leadTime: "5d",  status: "OK",        velocity: 9.2  },
  { sku: "TL-C0481", desc: "Unidad Rodamiento 3B", abc: "B", qty: 324,  reorder: 200, eoq: 340, safety: 50,  leadTime: "8d",  status: "OK",        velocity: 7.6  },
  { sku: "TL-D0512", desc: "Arnés de Cables L4",   abc: "C", qty: 67,   reorder: 80,  eoq: 140, safety: 25,  leadTime: "12d", status: "Reordenar", velocity: 3.4  },
  { sku: "TL-D0698", desc: "Paquete Sujetadores",  abc: "C", qty: 2890, reorder: 500, eoq: 800, safety: 100, leadTime: "3d",  status: "Exceso",    velocity: 2.1  },
];
const stockChart = [
  { day: "Lun", TLA: 142, TLB: 516, TLC: 88  },
  { day: "Mar", TLA: 114, TLB: 495, TLC: 71  },
  { day: "Mié", TLA: 86,  TLB: 474, TLC: 54  },
  { day: "Jue", TLA: 200, TLB: 453, TLC: 37  },
  { day: "Vie", TLA: 172, TLB: 432, TLC: 150 },
  { day: "Sáb", TLA: 144, TLB: 411, TLC: 122 },
  { day: "Dom", TLA: 116, TLB: 390, TLC: 94  },
];

const kpiData = [
  { label: "Envíos Totales",     value: "12,847",  delta: "+8.3%",  up: true,  sub: "Este mes" },
  { label: "Entregas A Tiempo",  value: "94.7%",   delta: "+1.2pp", up: true,  sub: "vs. mes anterior" },
  { label: "Costo Transp. Prom.",value: "$18.42",  delta: "-3.1%",  up: true,  sub: "por unidad" },
  { label: "Utilización Flota",  value: "79.1%",   delta: "-0.8pp", up: false, sub: "rutas activas" },
  { label: "Tasa de Relleno",    value: "88.4%",   delta: "+2.4pp", up: true,  sub: "cumplimiento" },
  { label: "Ingresos Netos",     value: "$3.28M",  delta: "+11.2%", up: true,  sub: "acumulado YTD" },
];

const activityLog = [
  { time: "09:42", event: "Ruta RT-2841 optimizada — ahorro de $1,240", type: "success" },
  { time: "09:38", event: "Alerta inventario: TL-A0041 debajo del punto de reorden", type: "warning" },
  { time: "09:31", event: "LP solver completado — Z = $24,680 (óptimo)", type: "success" },
  { time: "09:17", event: "Plan de transporte actualizado por revisión de demanda Q3", type: "info" },
  { time: "08:55", event: "Restricción de capacidad en Nodo 4 activa — 100% uso", type: "warning" },
  { time: "08:40", event: "MIP Branch & Bound convergido — gap 1.71%", type: "success" },
  { time: "08:22", event: "Prog. Dinámica resuelta — 6 períodos, costo total $6,200", type: "success" },
];

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, dark }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`rounded border px-3 py-2 text-xs shadow-lg ${dark ? "bg-[#0C0C10] border-white/10 text-[#E2E8F0]" : "bg-white border-black/8 text-[#0D1B2A]"}`}>
      {label && <p className="text-[10px] font-mono mb-1.5 opacity-60">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="opacity-70">{p.name}:</span>
          <span className="font-semibold">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card ${className}`}
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function Badge({ label, variant = "default" }: { label: string; variant?: "default" | "success" | "warning" | "danger" | "info" }) {
  const cls = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    danger:  "bg-red-500/10 text-red-600 border-red-500/20",
    info:    "bg-blue-500/10 text-blue-600 border-blue-500/20",
  }[variant];
  return (
    <span className={`inline-flex items-center text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function IconBtn({ icon: Icon, onClick, title }: { icon: React.ElementType; onClick?: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
      <Icon size={14} />
    </button>
  );
}

// ─── Logistics Map (SVG) ─────────────────────────────────────────────────────

const HUBS = [
  { id: "NY",  label: "New York",   x: 230, y: 112 },
  { id: "LA",  label: "Los Angeles",x: 134, y: 126 },
  { id: "CHI", label: "Chicago",    x: 205, y: 100 },
  { id: "HOU", label: "Houston",    x: 188, y: 140 },
  { id: "MIA", label: "Miami",      x: 222, y: 153 },
  { id: "LDN", label: "London",     x: 390, y: 76  },
  { id: "HAM", label: "Hamburg",    x: 410, y: 68  },
  { id: "RTM", label: "Rotterdam",  x: 400, y: 74  },
  { id: "SHA", label: "Shanghai",   x: 668, y: 128 },
  { id: "SIN", label: "Singapore",  x: 628, y: 194 },
  { id: "TYO", label: "Tokyo",      x: 710, y: 116 },
  { id: "DXB", label: "Dubai",      x: 514, y: 144 },
  { id: "SAO", label: "São Paulo",  x: 256, y: 262 },
  { id: "MUM", label: "Mumbai",     x: 554, y: 160 },
];

const ROUTES = [
  { from: "NY",  to: "LDN", active: true  },
  { from: "NY",  to: "HAM", active: false },
  { from: "LA",  to: "TYO", active: true  },
  { from: "LA",  to: "SHA", active: true  },
  { from: "LDN", to: "DXB", active: true  },
  { from: "DXB", to: "MUM", active: true  },
  { from: "DXB", to: "SIN", active: false },
  { from: "SHA", to: "SIN", active: true  },
  { from: "SHA", to: "TYO", active: false },
  { from: "HOU", to: "SAO", active: false },
  { from: "MUM", to: "SIN", active: true  },
  { from: "CHI", to: "NY",  active: false },
  { from: "RTM", to: "DXB", active: true  },
];

function LogisticsMap({ dark }: { dark: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hubMap = Object.fromEntries(HUBS.map(h => [h.id, h]));
  const bg = dark ? "#070712" : "#EEF2F8";
  const gridColor = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
  const activeRoute = dark ? "#3B82F6" : "#1345A8";
  const inactiveRoute = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const hubColor = dark ? "#0EA5E9" : "#1345A8";
  const hubGlow = dark ? "#3B82F6" : "#1345A8";
  const textColor = dark ? "#9CA3AF" : "#6B7280";

  return (
    <div className="relative w-full rounded-lg overflow-hidden" style={{ background: bg, aspectRatio: "800/280" }}>
      <svg viewBox="0 0 800 280" className="w-full h-full" style={{ fontFamily: "DM Mono, monospace" }}>
        {/* Grid */}
        {Array.from({ length: 17 }, (_, i) => (
          <line key={`vg${i}`} x1={i * 50} y1={0} x2={i * 50} y2={280} stroke={gridColor} strokeWidth={0.5} />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`hg${i}`} x1={0} y1={i * 47} x2={800} y2={i * 47} stroke={gridColor} strokeWidth={0.5} />
        ))}

        {/* Continent fills (very simplified) */}
        {[
          // N. America
          "M 55,42 L 195,32 L 220,54 L 238,90 L 245,118 L 252,152 L 242,178 L 220,198 L 195,208 L 170,196 L 145,178 L 118,162 L 88,148 L 64,130 L 54,100 Z",
          // S. America
          "M 188,208 L 278,208 L 302,232 L 312,272 L 298,208 Z M 230,208 L 278,210 L 304,250 L 308,274 L 286,196 Z",
          // Europe/part
          "M 365,36 L 450,34 L 458,58 L 442,78 L 420,92 L 400,96 L 375,84 L 362,62 Z",
          // Africa
          "M 362,108 L 450,104 L 458,150 L 448,192 L 432,238 L 412,268 L 390,272 L 366,252 L 350,208 L 348,162 L 356,132 Z",
          // Asia
          "M 460,32 L 560,22 L 660,28 L 730,44 L 755,72 L 748,102 L 720,124 L 708,144 L 672,152 L 645,158 L 618,196 L 598,200 L 570,192 L 546,170 L 518,160 L 485,152 L 462,132 L 448,102 L 448,62 Z",
          // Australia
          "M 618,244 L 708,236 L 746,264 L 748,296 L 716,316 L 672,318 L 638,302 L 618,276 Z",
        ].map((d, i) => (
          <path key={i} d={d} fill={dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"} stroke={dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"} strokeWidth={0.5} />
        ))}

        {/* Route lines */}
        {ROUTES.map(({ from, to, active }, i) => {
          const a = hubMap[from], b = hubMap[to];
          if (!a || !b) return null;
          const isHov = hovered === from || hovered === to;
          const color = active ? activeRoute : inactiveRoute;
          const dashLen = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={color} strokeWidth={isHov ? 1.5 : active ? 1 : 0.7}
                strokeDasharray={active ? `${dashLen}` : "4 4"}
                strokeDashoffset={active ? `${dashLen}` : undefined}
                opacity={isHov ? 1 : active ? 0.8 : 0.4}>
                {active && (
                  <animate attributeName="stroke-dashoffset"
                    from={`${dashLen}`} to="0"
                    dur={`${3 + i * 0.4}s`} repeatCount="indefinite" />
                )}
              </line>
            </g>
          );
        })}

        {/* Hub nodes */}
        {HUBS.map(hub => {
          const isHov = hovered === hub.id;
          return (
            <g key={hub.id} style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered(hub.id)}
              onMouseLeave={() => setHovered(null)}>
              {isHov && (
                <circle cx={hub.x} cy={hub.y} r={10} fill={hubGlow} opacity={0.15}>
                  <animate attributeName="r" values="8;14;8" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.15;0.05;0.15" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={hub.x} cy={hub.y} r={isHov ? 5 : 3.5} fill={hubColor}
                stroke={dark ? "#050505" : "#F4F7F6"} strokeWidth={1.5}
                style={{ filter: `drop-shadow(0 0 4px ${hubColor}80)` }} />
              <text x={hub.x} y={hub.y - 8} textAnchor="middle"
                fill={isHov ? hubColor : textColor}
                fontSize={isHov ? 9 : 8} fontWeight={isHov ? 600 : 400}>
                {hub.id}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g>
          <circle cx={16} cy={266} r={3} fill={activeRoute} />
          <text x={24} y={270} fill={textColor} fontSize={8}>Active route</text>
          <line x1={90} y1={266} x2={104} y2={266} stroke={inactiveRoute} strokeWidth={1} strokeDasharray="3 3" />
          <text x={110} y={270} fill={textColor} fontSize={8}>Standby</text>
        </g>
      </svg>
      <div className="absolute top-2 right-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] font-mono text-muted-foreground">LIVE</span>
      </div>
    </div>
  );
}

// ─── Module Views ─────────────────────────────────────────────────────────────

function OverviewView({ dark }: { dark: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpiData.map(k => (
          <Card key={k.label} className="px-4 py-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">{k.label}</p>
            <p className="text-xl font-semibold text-foreground leading-none">{k.value}</p>
            <div className="flex items-center gap-1 mt-2">
              {k.up ? <ArrowUpRight size={12} className="text-emerald-500" /> : <ArrowDownRight size={12} className="text-red-500" />}
              <span className={`text-[11px] font-mono font-medium ${k.up ? "text-emerald-600" : "text-red-500"}`}>{k.delta}</span>
              <span className="text-[11px] text-muted-foreground">{k.sub}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Map */}
      <Card>
        <SectionHeader title="Global Logistics Network"
          sub="14 hubs · 13 active routes · 247 vehicles tracked"
          actions={<>
            <IconBtn icon={RefreshCw} title="Refresh" />
            <IconBtn icon={Download} title="Export" />
          </>}
        />
        <div className="p-4">
          <LogisticsMap dark={dark} />
        </div>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <SectionHeader title="Shipment Volume & Revenue" sub="8-month rolling · USD thousands" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={shipmentTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={dark ? "#3B82F6" : "#1345A8"} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={dark ? "#3B82F6" : "#1345A8"} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={dark ? "#0EA5E9" : "#0369A1"} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={dark ? "#0EA5E9" : "#0369A1"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                <XAxis dataKey="month" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip dark={dark} />} />
                <Area type="monotone" dataKey="volume" name="Volume" stroke={dark ? "#3B82F6" : "#1345A8"} strokeWidth={2} fill="url(#gVol)" dot={false} />
                <Area type="monotone" dataKey="revenue" name="Revenue ($k)" stroke={dark ? "#0EA5E9" : "#0369A1"} strokeWidth={1.5} fill="url(#gRev)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Performance Index" sub="Multi-dimensional KPI radar" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={perfRadar}>
                <PolarGrid stroke={dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 10, fontFamily: "DM Mono" }} />
                <Radar dataKey="score" stroke={dark ? "#3B82F6" : "#1345A8"} fill={dark ? "#3B82F6" : "#1345A8"} fillOpacity={0.2} strokeWidth={1.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Activity log */}
      <Card>
        <SectionHeader title="System Activity Log" sub="Real-time operations events"
          actions={<Badge label="LIVE" variant="success" />}
        />
        <div className="divide-y divide-border">
          {activityLog.map((item, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-secondary/40 transition-colors">
              {item.type === "success" && <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />}
              {item.type === "warning" && <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />}
              {item.type === "info"    && <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />}
              <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-10">{item.time}</span>
              <span className="text-xs text-foreground">{item.event}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function LPView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];

  const displaySolution = activeSolution && Array.isArray(activeSolution.variables) ? activeSolution.variables.map((v: any) => ({
    variable: v.name === 'x1' ? 'x₁ (Product A)' : v.name === 'x2' ? 'x₂ (Product B)' : v.name === 'x3' ? 'x₃ (Product C)' : v.name,
    value: v.value,
    reducedCost: v.reduced_cost ?? v.reducedCost ?? 0.0,
    lower: v.lower ?? "—",
    upper: v.upper ?? "—"
  })) : lpSolution;

  const displayConstraints = activeSolution && Array.isArray(activeSolution.constraints) ? activeSolution.constraints.map((c: any) => ({
    name: c.name.replace(/_/g, ' '),
    slack: c.slack,
    shadowPrice: c.shadow_price ?? c.shadowPrice ?? 0.0,
    rhsLow: c.rhsLow ?? "—",
    rhsHigh: c.rhsHigh ?? "—"
  })) : lpConstraints;

  const objVal = activeSolution && activeSolution.objectiveValue !== undefined ? activeSolution.objectiveValue : 24.68;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHeader title="Problem Formulation" sub="Maximize Z = 5x₁ + 4x₂ + 3x₃ (weekly profit in $000s)" />
        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "Labor Hours", expr: "6x₁ + 4x₂ + 2x₃ ≤ 240", util: activeSolution ? (displayConstraints[0]?.slack === 0 ? "100%" : "91.2%") : "100%", binding: activeSolution ? displayConstraints[0]?.slack === 0 : true },
            { name: "Raw Material", expr: "3x₁ + 2x₂ + 5x₃ ≤ 270", util: activeSolution ? (displayConstraints[1]?.slack === 0 ? "100%" : "95.4%") : "95.4%", binding: activeSolution ? displayConstraints[1]?.slack === 0 : false },
            { name: "Machine Hours", expr: "5x₁ + 6x₂ + 5x₃ ≤ 420", util: activeSolution ? (displayConstraints[2]?.slack === 0 ? "100%" : "92.5%") : "100%", binding: activeSolution ? displayConstraints[2]?.slack === 0 : true },
          ].map(c => (
            <div key={c.name} className={`rounded-lg border p-3 ${c.binding ? (dark ? "border-blue-500/30 bg-blue-500/5" : "border-blue-700/20 bg-blue-50") : "border-border bg-secondary/30"}`}>
              <p className="text-[10px] font-mono text-muted-foreground">{c.name}</p>
              <p className="text-sm font-mono font-medium text-foreground mt-1">{c.expr}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-muted-foreground">Utilization</span>
                <span className={`text-[10px] font-mono font-semibold ${c.binding ? "text-amber-500" : "text-emerald-500"}`}>{c.util}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Optimal Solution" sub={`Simplex — Phase II complete · Z* = $${(objVal * 1000).toLocaleString()}`}
            actions={<Badge label="OPTIMAL" variant="success" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Variable", "Value", "Reduced Cost", "Lower Bound", "Upper Bound"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displaySolution.map(r => (
                  <tr key={r.variable} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-primary">{r.variable}</td>
                    <td className="px-5 py-3 font-semibold text-foreground font-mono">{r.value.toFixed(2)}</td>
                    <td className={`px-5 py-3 font-mono ${r.reducedCost < 0 ? "text-amber-500" : "text-muted-foreground"}`}>{r.reducedCost.toFixed(2)}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground">{r.lower}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground">{r.upper}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Sensitivity Analysis" sub="Dual values & RHS ranging" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Constraint", "Slack", "Shadow Price", "RHS Low", "RHS High"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayConstraints.map(r => (
                  <tr key={r.name} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 text-foreground">{r.name}</td>
                    <td className={`px-5 py-3 font-mono ${r.slack === 0 ? "text-amber-500 font-semibold" : "text-emerald-600"}`}>{r.slack.toFixed(2)}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-primary">${r.shadowPrice.toFixed(3)}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground">{r.rhsLow}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground">{r.rhsHigh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-mono text-muted-foreground mb-3 uppercase tracking-widest">RHS Ranging — Current vs. Feasible Range</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={lpSensChart} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="constraint" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 10, fontFamily: "DM Mono" }} width={60} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip dark={dark} />} />
                <Bar dataKey="lower" name="Lower" fill={dark ? "rgba(59,130,246,0.2)" : "rgba(19,69,168,0.1)"} radius={[2,0,0,2]} />
                <Bar dataKey="current" name="Current" fill={dark ? "#3B82F6" : "#1345A8"} radius={0} />
                <Bar dataKey="upper" name="Upper" fill={dark ? "rgba(14,165,233,0.3)" : "rgba(3,105,161,0.15)"} radius={[0,2,2,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function TransportView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];

  const displayPlan = activeSolution && Array.isArray(activeSolution.variables) ? activeSolution.variables.map((v: any) => ({
    route: `${v.origin.replace(/_/g, ' ')} → ${v.destination.replace(/_/g, ' ')}`,
    units: v.units,
    cost: v.cost,
    pct: Math.round((v.units / 240) * 100),
    status: "Optimal"
  })) : transportPlan;

  const totalCost = activeSolution && activeSolution.objectiveValue !== undefined ? activeSolution.objectiveValue : 8440;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHeader title="Network Route Map" sub="3 origins · 4 destinations · optimal allocation visualized" />
        <div className="p-4">
          <LogisticsMap dark={dark} />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Cost Matrix ($/unit)" sub="Transportation tableau — Northwest corner initialized" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground">Origin \ Dest.</th>
                  {["Denver", "Chicago", "Miami", "New York", "Supply"].map(h => (
                    <th key={h} className="text-center px-3 py-2.5 text-[10px] font-mono text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {costMatrix.map((row, i) => (
                  <tr key={i} className={`${i === 3 ? "border-t-2 border-border bg-secondary/20" : "hover:bg-secondary/30"} transition-colors`}>
                    <td className="px-5 py-3 font-mono text-foreground text-[11px]">{row.origin}</td>
                    {[row.denver, row.chicago, row.miami, row.newYork].map((v, j) => (
                      <td key={j} className={`text-center px-3 py-3 font-mono font-semibold text-[11px] ${i === 3 ? "text-primary" : "text-foreground"}`}>
                        {i < 3 ? `$${v}` : v}
                      </td>
                    ))}
                    <td className={`text-center px-3 py-3 font-mono font-bold text-[11px] ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
                      {row.supply !== null ? row.supply : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Optimal Transport Plan" sub={`Total cost: $${totalCost.toLocaleString()} · ${displayPlan.length} active routes`}
            actions={<Badge label="OPTIMAL" variant="success" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Route", "Units", "Cost", "Utilization", "Status"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayPlan.map(r => (
                  <tr key={r.route} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] text-foreground">{r.route}</td>
                    <td className="px-4 py-3 font-mono text-foreground">{r.units}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-primary">${r.cost.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1 rounded-full bg-secondary overflow-hidden">
                           <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: dark ? "#3B82F6" : "#1345A8" }} />
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">{r.pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={r.status} variant={r.status === "Optimal" ? "success" : "warning"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function NetworksView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];

  const displayNodes = activeSolution && activeSolution.variables ? Object.entries(activeSolution.variables).flatMap(([src, targets]: [string, any]) =>
    Object.entries(targets).map(([tgt, flow]: [string, any]) => ({
      node: `${src.replace(/_/g, ' ')} → ${tgt.replace(/_/g, ' ')}`,
      type: "Active Arc",
      flow_in: flow,
      flow_out: flow,
      excess: flow > 0 ? flow : 0
    }))
  ) : null;

  const totalCost = activeSolution && activeSolution.objectiveValue !== undefined ? activeSolution.objectiveValue : 6820;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Node Flow Analysis" sub={`Min-cost flow · total flow: 350 units · total cost: $${totalCost.toLocaleString()}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Arc / Route", "Type", "Flow In", "Flow Out", "Flow Amount"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayNodes ? displayNodes.map((r, i) => (
                  <tr key={i} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-[11px] text-foreground">{r.node}</td>
                    <td className="px-5 py-3">
                      <Badge label={r.type} variant="info" />
                    </td>
                    <td className="px-5 py-3 font-mono text-foreground">{r.flow_in}</td>
                    <td className="px-5 py-3 font-mono text-foreground">{r.flow_out}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-emerald-600">
                      {r.excess}
                    </td>
                  </tr>
                )) : networkNodes.map(r => (
                  <tr key={r.node} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-[11px] text-foreground">{r.node}</td>
                    <td className="px-5 py-3">
                      <Badge label={r.type} variant={r.type === "Source" ? "info" : r.type === "Sink" ? "warning" : "default"} />
                    </td>
                    <td className="px-5 py-3 font-mono text-foreground">{r.flow_in}</td>
                    <td className="px-5 py-3 font-mono text-foreground">{r.flow_out}</td>
                    <td className={`px-5 py-3 font-mono font-semibold ${r.excess > 0 ? "text-emerald-600" : r.excess < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {r.excess > 0 ? `+${r.excess}` : r.excess}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Flow Over Time" sub="Network utilization — 6 periods" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={networkFlow} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                <XAxis dataKey="t" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip dark={dark} />} />
                <ReferenceLine y={200} stroke={dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"} strokeDasharray="4 4" label={{ value: "Capacity", position: "right", fontSize: 10, fill: dark ? "#6B7280" : "#9CA3AF", fontFamily: "DM Mono" }} />
                <Line type="monotone" dataKey="flowA" name="Arc A→B" stroke={dark ? "#3B82F6" : "#1345A8"} strokeWidth={2} dot={{ r: 3, fill: dark ? "#3B82F6" : "#1345A8" }} />
                <Line type="monotone" dataKey="flowB" name="Arc C→D" stroke={dark ? "#0EA5E9" : "#0369A1"} strokeWidth={2} dot={{ r: 3, fill: dark ? "#0EA5E9" : "#0369A1" }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function DPView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];

  const displayStages = activeSolution && Array.isArray(activeSolution.variables) ? activeSolution.variables.map((v: any) => ({
    stage: `Period ${v.period}`,
    state: `s = ${v.covered_periods.length * 40} units`,
    decision: `Order ${v.order_qty} units`,
    value: v.order_qty > 0 ? 200 : 0,
    cumCost: activeSolution.objectiveValue ?? 6200
  })) : dpStages;

  const totalCost = activeSolution && activeSolution.objectiveValue !== undefined ? activeSolution.objectiveValue : 6200;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Stage-State Optimal Policy" sub={`6-period inventory DP · total cost: $${totalCost.toLocaleString()}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Stage", "State", "Decision", "Setup Value", "Cumulative Cost"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayStages.map((r, i) => (
                  <tr key={i} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-primary font-medium">{r.stage}</td>
                    <td className="px-5 py-3 font-mono text-foreground">{r.state}</td>
                    <td className="px-5 py-3 text-foreground text-[11px]">{r.decision}</td>
                    <td className="px-5 py-3 font-mono text-foreground">${r.value.toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-primary">${r.cumCost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Value Function Vₜ(s)" sub="Bellman optimality — 3 periods shown" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dpValueFn} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                <XAxis dataKey="state" name="Inventory State" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip dark={dark} />} />
                <Line type="monotone" dataKey="v1" name="V₁(s)" stroke={dark ? "#3B82F6" : "#1345A8"} strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="v2" name="V₂(s)" stroke={dark ? "#0EA5E9" : "#0369A1"} strokeWidth={2} strokeDasharray="5 2" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="v3" name="V₃(s)" stroke={dark ? "#A78BFA" : "#7C3AED"} strokeWidth={2} strokeDasharray="3 3" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function InventoriesView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];

  const displayInventory = activeSolution && Array.isArray(activeSolution.variables) && activeSolution.variables[0] ? [
    { sku: "TL-A0041 (DB)", desc: "Hydraulic Pump", abc: "A", qty: 142, reorder: Math.round(activeSolution.variables[0].reorder_point), eoq: Math.round(activeSolution.variables[0].eoq), safety: Math.round(activeSolution.variables[0].safety_stock), leadTime: "7d", status: "OK", velocity: 28.4 },
    ...inventoryData.slice(1)
  ] : inventoryData;

  const totalCost = activeSolution && Array.isArray(activeSolution.variables) && activeSolution.variables[0] ? activeSolution.variables[0].total_cost : 18.42;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "A-Class Items",  val: "2",    sub: "High value — 70% revenue", color: "text-primary" },
          { label: "Avg. Days Cover",val: "18.4d", sub: "Across all SKUs",          color: "text-foreground" },
          { label: "Reorder Alerts", val: "3",    sub: "2 critical · 1 warning",    color: "text-amber-500" },
        ].map(s => (
          <Card key={s.label} className="px-4 py-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{s.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${s.color}`}>{s.val}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{s.sub}</p>
          </Card>
        ))}
      </div>

      <Card>
        <SectionHeader title="SKU Inventory Register" sub={`7 SKUs · ABC classification · EOQ model · Setup cost: $${totalCost.toLocaleString()}`}
          actions={<>
            <IconBtn icon={Filter} /><IconBtn icon={Download} />
          </>}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["SKU", "Description", "ABC", "Qty On-Hand", "Reorder Pt.", "EOQ", "Safety Stk.", "Lead Time", "Velocity/day", "Status"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayInventory.map(r => (
                <tr key={r.sku} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-primary text-[11px]">{r.sku}</td>
                  <td className="px-4 py-3 text-foreground">{r.desc}</td>
                  <td className="px-4 py-3">
                    <span className={`font-mono font-bold text-sm ${r.abc === "A" ? "text-primary" : r.abc === "B" ? (dark ? "text-sky-400" : "text-sky-700") : "text-muted-foreground"}`}>{r.abc}</span>
                  </td>
                  <td className={`px-4 py-3 font-mono font-semibold ${r.qty < r.reorder ? "text-red-500" : "text-foreground"}`}>{r.qty}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.reorder}</td>
                  <td className="px-4 py-3 font-mono text-foreground">{r.eoq}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.safety}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.leadTime}</td>
                  <td className="px-4 py-3 font-mono text-foreground">{r.velocity}</td>
                  <td className="px-4 py-3">
                    <Badge label={r.status}
                      variant={r.status === "Critical" ? "danger" : r.status === "Reorder" ? "warning" : r.status === "Excess" ? "info" : "success"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Stock Level Trend" sub="7-day rolling · 3 key SKUs" />
        <div className="p-4">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stockChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
              <XAxis dataKey="day" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip dark={dark} />} />
              <ReferenceLine y={200} stroke={dark ? "rgba(239,68,68,0.3)" : "rgba(220,38,38,0.2)"} strokeDasharray="4 4" />
              <ReferenceLine y={150} stroke={dark ? "rgba(239,68,68,0.3)" : "rgba(220,38,38,0.2)"} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="TLA" name="TL-A0041" stroke={dark ? "#3B82F6" : "#1345A8"} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="TLB" name="TL-B0128" stroke={dark ? "#0EA5E9" : "#0369A1"} strokeWidth={2} strokeDasharray="5 2" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="TLC" name="TL-B0219" stroke={dark ? "#F87171" : "#DC2626"} strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ─── AI Tutor ─────────────────────────────────────────────────────────────────

const MODULE_INTROS: Record<ModuleId, string> = {
  overview:    "Bienvenido al Centro de Control de Tech-Logistics. Puedo ayudarte a interpretar KPIs, diagnosticar anomalías o realizar análisis de escenarios. ¿Qué te gustaría explorar?",
  lp:          "Veo que estás revisando el optimizador lineal. La solución óptima actual Z* = $24.68k tiene dos restricciones activas. ¿Te gustaría analizar la interpretación del dual o realizar un análisis de sensibilidad?",
  transport:   "El modelo de transporte muestra 6 rutas activas con un costo total de $8,440. El carril Seattle→Denver está completamente asignado. ¿Debería verificar asignaciones alternas?",
  networks:    "El análisis de redes confirma un flujo de costo mínimo para 350 unidades. Los Nodos 3 y 4 son puntos de transbordo. ¿Quieres correr sensibilidad de capacidades de arcos?",
  ip:          "El resolvedor PE/MIP convergió con un gap de optimidad del 1.71%. La relajación lineal dio $4,820.40 vs el óptimo entero de $4,740. ¿Quieres analizar el árbol de ramificación?",
  dp:          "La programación dinámica resolvió el problema de inventario de 6 períodos con un costo total de $6,200. Las ecuaciones de Bellman indican ordenar en períodos 1, 3 y 5. ¿Quieres ver el detalle?",
  inventories: "Auditoría de inventario: 3 SKUs requieren acción — TL-A0041 y TL-D0512 están por debajo del punto de reorden. ¿Calculamos los parámetros de EOQ revisados?",
};

function AiTutor({ dark, activeModule, activeModelData }: { dark: boolean; activeModule: ModuleId; activeModelData?: any }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevModule = useRef<ModuleId | null>(null);

  useEffect(() => {
    if (prevModule.current !== activeModule) {
      setMessages([{ role: "assistant", text: MODULE_INTROS[activeModule] }]);
      prevModule.current = activeModule;
    }
  }, [activeModule]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const userMsg = { role: "user" as const, text };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setTyping(true);

    try {
      const solution = activeModelData?.solutions?.[0] || {};
      const problemContext = `Active Module: ${activeModule}. Model configuration: ${JSON.stringify(activeModelData?.data || {})}`;

      const response = await fetch("http://localhost:4000/api/tutor/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemContext,
          mathematicalSolution: solution,
          userMessage: text,
          chatHistory: messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            text: m.text
          }))
        })
      });

      const resData = await response.json();
      setTyping(false);

      if (resData.status === "success" && resData.reply) {
        setMessages(m => [...m, { role: "assistant", text: resData.reply }]);
      } else {
        setMessages(m => [...m, { role: "assistant", text: "I'm having trouble analyzing the model right now. Could you please check the server connection?" }]);
      }
    } catch (error) {
      setTyping(false);
      setMessages(m => [...m, { role: "assistant", text: "Error de conexión con el Tutor Socrático. Asegúrate de que el backend está corriendo." }]);
    }
  };

  const bg = dark ? "#0C0C10" : "#FFFFFF";
  const border = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const accent = dark ? "#3B82F6" : "#1345A8";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105"
        style={{ background: accent, boxShadow: `0 4px 20px ${accent}50` }}
      >
        {open ? <X size={18} className="text-white" /> : <Brain size={18} className="text-white" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[340px] rounded-xl overflow-hidden flex flex-col"
          style={{
            background: bg,
            border: `1px solid ${border}`,
            boxShadow: dark ? "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)" : "0 20px 60px rgba(0,0,0,0.15)",
            height: 480,
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2.5 border-b" style={{ borderColor: border }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: accent }}>
              <Brain size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: dark ? "#E2E8F0" : "#0D1B2A" }}>AI Tutor</p>
              <p className="text-[10px] font-mono" style={{ color: dark ? "#3B82F6" : "#1345A8" }}>
                {MODULES.find(m => m.id === activeModule)?.shortLabel} · ACTIVE
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono" style={{ color: dark ? "#6B7280" : "#9CA3AF" }}>GPT-4o</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollbarWidth: "none" }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "assistant" && (
                  <span className="text-[9px] font-mono mb-1" style={{ color: dark ? "#6B7280" : "#9CA3AF" }}>AI TUTOR</span>
                )}
                <div
                  className="max-w-[92%] text-xs leading-relaxed px-3 py-2 rounded-lg"
                  style={{
                    background: m.role === "user"
                      ? (dark ? "rgba(59,130,246,0.12)" : "rgba(19,69,168,0.07)")
                      : (dark ? "rgba(255,255,255,0.04)" : "#F4F7F6"),
                    border: m.role === "user"
                      ? `1px solid ${dark ? "rgba(59,130,246,0.25)" : "rgba(19,69,168,0.15)"}`
                      : `1px solid ${border}`,
                    color: dark ? "#E2E8F0" : "#0D1B2A",
                    borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg w-fit" style={{ background: dark ? "rgba(255,255,255,0.04)" : "#F4F7F6", border: `1px solid ${border}` }}>
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: accent, animationDelay: `${d}ms` }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t" style={{ borderColor: border }}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: dark ? "rgba(255,255,255,0.05)" : "#F4F7F6", border: `1px solid ${border}` }}>
              <Terminal size={12} style={{ color: dark ? "#6B7280" : "#9CA3AF" }} className="shrink-0" />
              <input
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: dark ? "#E2E8F0" : "#0D1B2A", fontFamily: "DM Mono, monospace" }}
                placeholder="Ask about this module..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
              />
              <button onClick={send} className="shrink-0 transition-opacity hover:opacity-70">
                <Send size={12} style={{ color: accent }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  active, setActive, collapsed, setCollapsed, dark, mobileOpen, setMobileOpen,
}: {
  active: ModuleId; setActive: (id: ModuleId) => void;
  collapsed: boolean; setCollapsed: (v: boolean) => void;
  dark: boolean; mobileOpen: boolean; setMobileOpen: (v: boolean) => void;
}) {
  const accentBlue = dark ? "#3B82F6" : "#1345A8";
  const bg = dark ? "#08080C" : "#FFFFFF";
  const borderColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  const textMuted = dark ? "#6B7280" : "#9CA3AF";
  const textFg = dark ? "#E2E8F0" : "#0D1B2A";
  const activeBg = dark ? "rgba(59,130,246,0.1)" : "rgba(19,69,168,0.06)";
  const hoverBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className="fixed lg:relative z-30 lg:z-auto flex flex-col h-full transition-all duration-200"
        style={{
          width: collapsed ? 64 : 240,
          background: bg,
          borderRight: `1px solid ${borderColor}`,
          transform: mobileOpen ? "translateX(0)" : undefined,
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        {/* Brand */}
        <div className="flex items-center px-4 h-14 border-b shrink-0" style={{ borderColor }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: accentBlue }}>
            <Zap size={14} className="text-white" />
          </div>
          {!collapsed && (
            <div className="ml-2.5 overflow-hidden">
              <p className="text-sm font-semibold leading-none" style={{ color: textFg }}>Tech-Logistics</p>
              <p className="text-[9px] font-mono mt-0.5" style={{ color: textMuted }}>SCO PLATFORM v4.2</p>
            </div>
          )}
          <button
            className="ml-auto p-1 rounded transition-colors lg:flex hidden"
            style={{ color: textMuted }}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
          <button className="ml-auto lg:hidden p-1" style={{ color: textMuted }} onClick={() => setMobileOpen(false)}>
            <X size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          {!collapsed && (
            <p className="text-[9px] font-mono uppercase tracking-widest px-2 pb-2" style={{ color: textMuted }}>
              Command Center
            </p>
          )}
          {MODULES.map(mod => {
            const Icon = mod.icon;
            const isActive = active === mod.id;
            return (
              <button
                key={mod.id}
                onClick={() => { setActive(mod.id); setMobileOpen(false); }}
                title={collapsed ? mod.label : undefined}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg mb-0.5 text-left transition-colors"
                style={{
                  background: isActive ? activeBg : "transparent",
                  borderLeft: isActive ? `2px solid ${accentBlue}` : "2px solid transparent",
                  color: isActive ? accentBlue : textMuted,
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <Icon size={15} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="text-xs font-medium flex-1 truncate" style={{ color: isActive ? accentBlue : textFg }}>
                      {mod.shortLabel}
                    </span>
                    {mod.badge && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          background: mod.badge === "New" ? (dark ? "rgba(14,165,233,0.1)" : "rgba(3,105,161,0.08)") : (dark ? "rgba(239,68,68,0.1)" : "rgba(220,38,38,0.08)"),
                          color: mod.badge === "New" ? (dark ? "#0EA5E9" : "#0369A1") : (dark ? "#F87171" : "#DC2626"),
                        }}>
                        {mod.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Status footer */}
        <div className="px-2 py-3 border-t shrink-0" style={{ borderColor }}>
          {!collapsed ? (
            <div className="px-3 py-2.5 rounded-lg" style={{ background: dark ? "rgba(255,255,255,0.03)" : "#F4F7F6" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: textMuted }}>Motor de Solución</span>
                <span className="text-[9px] font-mono font-semibold text-emerald-500">ACTIVO</span>
              </div>
              {[{ label: "Núcleo LP/MIP", ok: true }, { label: "Transporte", ok: true }, { label: "Motor DP", ok: true }].map(s => (
                <div key={s.label} className="flex items-center gap-1.5 py-0.5">
                  <span className={`w-1 h-1 rounded-full ${s.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="text-[10px]" style={{ color: textMuted }}>{s.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [dark, setDark] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuleId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [dbModels, setDbModels] = useState<any[]>([]);
  const [solving, setSolving] = useState(false);

  // States for parameters JSON editing
  const [editing, setEditing] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const fetchModels = async () => {
    try {
      const res = await fetch("http://localhost:4000/api/models");
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setDbModels(json.data);
      }
    } catch (err) {
      console.error("Failed to load db models:", err);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const activeModelData = dbModels.find(m => {
    if (activeModule === 'ip') return m.type.toUpperCase() === 'LP';
    return m.type.toUpperCase() === activeModule.toUpperCase();
  });

  const handleToggleEdit = () => {
    if (!activeModelData) return;
    setJsonText(JSON.stringify(activeModelData.data, null, 2));
    setJsonError(null);
    setEditing(!editing);
  };

  const handleJsonChange = (val: string) => {
    setJsonText(val);
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const handleSaveAndSolve = async () => {
    if (jsonError || !activeModelData) return;
    setSolving(true);
    try {
      const parsedData = JSON.parse(jsonText);
      const response = await fetch(`http://localhost:4000/api/models/${activeModelData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsedData })
      });
      const result = await response.json();
      if (result.status === "success" && result.data) {
        setDbModels(prev => prev.map(m => m.id === activeModelData.id ? result.data : m));
        setEditing(false);
        alert("¡Parámetros guardados y modelo resuelto con éxito!");
      } else {
        alert(`Error al guardar y resolver: ${result.message}`);
      }
    } catch (err) {
      alert("Error de conexión al guardar los datos.");
    } finally {
      setSolving(false);
    }
  };

  const handleRunSolver = async () => {
    if (activeModule === "overview") return;
    const solverType = activeModule === "ip" ? "lp" : activeModule;
    const model = dbModels.find(m => m.type.toLowerCase() === (activeModule === "ip" ? "lp" : activeModule.toLowerCase()));
    if (!model) {
      alert("No se encontró configuración para este modelo en la base de datos.");
      return;
    }

    setSolving(true);
    try {
      const response = await fetch(`http://localhost:4000/api/${solverType}/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(model.data)
      });
      const result = await response.json();
      if (result.status === "success") {
        setDbModels(prev => prev.map(m => {
          if (m.id === model.id) {
            const variables = result.data.variables ?? result.data.allocations ?? result.data.result?.flows ?? result.data.decisions ?? [result.data.result];
            const objectiveValue = result.data.objective_value ?? result.data.total_cost ?? result.data.result?.total_cost ?? result.data.optimal_value ?? null;
            const constraints = result.data.constraints ?? result.data.details ?? {};
            return {
              ...m,
              solutions: [{
                status: result.data.status,
                objectiveValue,
                variables,
                constraints
              }]
            };
          }
          return m;
        }));
        alert(`¡Modelo ${model.type} resuelto con éxito! Nueva solución guardada.`);
      } else {
        alert(`Error al resolver el modelo: ${result.message}`);
      }
    } catch (err) {
      alert("Error de conexión al resolver el modelo.");
    } finally {
      setSolving(false);
    }
  };

  const bg = dark ? "#050505" : "#F4F7F6";
  const topbarBg = dark ? "rgba(8,8,12,0.95)" : "rgba(255,255,255,0.96)";
  const borderColor = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const textFg = dark ? "#E2E8F0" : "#0D1B2A";
  const textMuted = dark ? "#6B7280" : "#9CA3AF";
  const accentBlue = dark ? "#3B82F6" : "#1345A8";
  const currentModule = MODULES.find(m => m.id === activeModule)!;

  const moduleView = {
    overview:    <OverviewView dark={dark} />,
    lp:          <LPView dark={dark} modelData={activeModelData} />,
    transport:   <TransportView dark={dark} modelData={activeModelData} />,
    networks:    <NetworksView dark={dark} modelData={activeModelData} />,
    ip:          <LPView dark={dark} modelData={activeModelData} />,
    dp:          <DPView dark={dark} modelData={activeModelData} />,
    inventories: <InventoriesView dark={dark} modelData={activeModelData} />,
  }[activeModule];

  return (
    <div className={dark ? "dark" : ""} style={{ height: "100vh", width: "100vw", overflow: "hidden", background: bg, fontFamily: "Inter, sans-serif" }}>
      <div className="flex h-full w-full overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          active={activeModule} setActive={setActiveModule}
          collapsed={collapsed} setCollapsed={setCollapsed}
          dark={dark} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
        />

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="flex items-center gap-3 px-5 h-14 shrink-0 border-b"
            style={{ background: topbarBg, borderColor, backdropFilter: "blur(12px)" }}>

            <button className="lg:hidden p-1.5 rounded" style={{ color: textMuted }} onClick={() => setMobileOpen(true)}>
              <Menu size={18} />
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: textMuted }}>
              <span>Tech-Logistics</span>
              <ChevronRight size={12} />
              <span style={{ color: textFg, fontWeight: 500 }}>{currentModule.label}</span>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Search */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${borderColor}`, color: textMuted }}>
              <Search size={12} />
              <span className="font-mono">Buscar módulos...</span>
              <span className="font-mono ml-8 text-[10px] opacity-50">⌘K</span>
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors"
              style={{ background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${borderColor}`, color: textMuted }}
            >
              {dark ? <Sun size={13} /> : <Moon size={13} />}
              <span>{dark ? "Claro" : "Oscuro"}</span>
            </button>

            <button className="relative p-1.5 rounded transition-colors" style={{ color: textMuted }}>
              <Bell size={16} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
            </button>

            <button className="p-1.5 rounded transition-colors" style={{ color: textMuted }}>
              <Settings size={16} />
            </button>

            {/* Avatar */}
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
              style={{ background: accentBlue }}>
              AL
            </div>
          </header>

          {/* Module header bar */}
          <div className="flex items-center justify-between px-6 py-3 border-b shrink-0"
            style={{ borderColor, background: dark ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.015)" }}>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold" style={{ color: textFg }}>{currentModule.label}</h1>
                {currentModule.badge && (
                  <Badge label={currentModule.badge} variant={currentModule.badge === "New" ? "info" : "danger"} />
                )}
              </div>
              <p className="text-[11px] mt-0.5 font-mono" style={{ color: textMuted }}>{currentModule.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor, color: textMuted }}
                onClick={fetchModels}
              >
                <RefreshCw size={12} />
                <span className="hidden sm:inline font-mono">Refrescar</span>
              </button>
              {activeModule !== "overview" && (
                <button
                  onClick={handleToggleEdit}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors font-semibold"
                  style={{ borderColor, color: editing ? "#EF4444" : textFg }}>
                  <Settings size={12} />
                  <span>{editing ? "Cancelar" : "Editar Datos"}</span>
                </button>
              )}
              <button
                onClick={handleRunSolver}
                disabled={solving}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors text-white disabled:opacity-50"
                style={{ background: accentBlue, boxShadow: `0 0 12px ${accentBlue}40` }}>
                <Zap size={12} className={solving ? "animate-spin" : ""} />
                <span className="hidden sm:inline">{solving ? "Resolviendo..." : "Resolver"}</span>
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <main className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "none" }}>
            {editing && activeModelData && (
              <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
                <SectionHeader
                  title="Editor de Parámetros del Modelo"
                  sub="Modifica directamente los datos de entrada en formato JSON de la base de datos."
                  actions={
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveAndSolve}
                        disabled={solving || !!jsonError}
                        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded font-semibold disabled:opacity-50"
                      >
                        {solving ? "Guardando..." : "Guardar y Resolver"}
                      </button>
                    </div>
                  }
                />
                <div className="p-4 flex flex-col gap-2">
                  <textarea
                    value={jsonText}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    rows={10}
                    className="w-full font-mono text-xs p-3 rounded border bg-black text-emerald-400 focus:outline-none"
                    style={{ borderColor: jsonError ? "#EF4444" : borderColor }}
                  />
                  {jsonError && (
                    <p className="text-xs text-red-500 font-mono">Error de sintaxis JSON: {jsonError}</p>
                  )}
                </div>
              </Card>
            )}
            {moduleView}
            <div className="h-20" />
          </main>
        </div>
      </div>

      {/* AI Tutor */}
      <AiTutor dark={dark} activeModule={activeModule} activeModelData={activeModelData} />

      <style>{`* { scrollbar-width: none; } *::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
