import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  ChevronsLeft, ChevronsRight, Terminal, Paperclip, Check,
  Minus
} from "lucide-react";
import { TransportEditor } from "../components/TransportEditor";
import { LPEditor } from "../components/LPEditor";
import { NetworksEditor } from "../components/NetworksEditor";
import { DynamicEditor } from "../components/DynamicEditor";
import { InventoriesEditor } from "../components/InventoriesEditor";

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
  { origin: "Quito Norte",  manta: 12, loja: 18, machala: 28, ambato: 22, supply: 180 },
  { origin: "Guayaquil Sur", manta:  9, loja: 14, machala: 16, ambato: 24, supply: 240 },
  { origin: "Cuenca C.",     manta: 20, loja: 11, machala:  8, ambato: 13, supply: 160 },
  { origin: "Demanda",       manta: 140, loja: 160, machala: 120, ambato: 160, supply: null },
];
const transportPlan = [
  { route: "Quito → Manta",   units: 140, cost: 1680, pct: 78, status: "Óptimo" },
  { route: "Quito → Loja",  units:  40, cost:  720, pct: 22, status: "Óptimo" },
  { route: "Guayaquil → Loja",   units: 120, cost: 1680, pct: 50, status: "Óptimo" },
  { route: "Guayaquil → Ambato",  units: 120, cost: 2880, pct: 50, status: "Óptimo" },
  { route: "Cuenca → Machala",    units: 120, cost:  960, pct: 75, status: "Óptimo" },
  { route: "Cuenca → Ambato", units:  40, cost:  520, pct: 25, status: "Subóptimo" },
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
  const isDisabled = !onClick;
  return (
    <button onClick={onClick} title={isDisabled ? "Próximamente" : title} disabled={isDisabled}
      className={`p-1.5 rounded transition-colors ${isDisabled ? "text-muted-foreground opacity-40 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
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

const ECUADOR_CITIES: Record<string, { name: string, coords: [number, number] }> = {
  // Transport hubs
  "Quito": { name: "Quito", coords: [-0.1807, -78.4678] },
  "Manta": { name: "Manta", coords: [-0.9621, -80.7127] },
  "Guayaquil": { name: "Guayaquil", coords: [-2.1894, -79.8890] },
  "Cuenca": { name: "Cuenca", coords: [-2.9001, -79.0059] },
  "Ambato": { name: "Ambato", coords: [-1.2491, -78.6273] },
  "Santo Domingo": { name: "Santo Domingo", coords: [-0.2530, -79.1754] },
  "Ibarra": { name: "Ibarra", coords: [0.3517, -78.1222] },
  "Loja": { name: "Loja", coords: [-3.9931, -79.2042] },
  "Esmeraldas": { name: "Esmeraldas", coords: [0.9682, -79.6517] },
  "Machala": { name: "Machala", coords: [-3.2581, -79.9553] },
  "Portoviejo": { name: "Portoviejo", coords: [-1.0546, -80.4542] },
  "Riobamba": { name: "Riobamba", coords: [-1.6709, -78.6475] },
  "Tena": { name: "Tena", coords: [-0.9938, -77.8129] },
  "Latacunga": { name: "Latacunga", coords: [-0.9333, -78.6167] },
  "Puyo": { name: "Puyo", coords: [-1.4833, -78.0000] },
  "Coca": { name: "Coca", coords: [-0.4665, -76.9871] },

  // Overview hubs
  "NY": { name: "Quito", coords: [-0.1807, -78.4678] },
  "LA": { name: "Guayaquil", coords: [-2.1894, -79.8890] },
  "CHI": { name: "Cuenca", coords: [-2.9001, -79.0059] },
  "HOU": { name: "Manta", coords: [-0.9621, -80.7127] },
  "MIA": { name: "Ambato", coords: [-1.2491, -78.6273] },
  "LDN": { name: "Santo Domingo", coords: [-0.2530, -79.1754] },
  "HAM": { name: "Loja", coords: [-3.9931, -79.2042] },
  "RTM": { name: "Esmeraldas", coords: [0.9682, -79.6517] },
  "SHA": { name: "Machala", coords: [-3.2581, -79.9553] },
  "SIN": { name: "Ibarra", coords: [0.3517, -78.1222] },
  "TYO": { name: "Portoviejo", coords: [-1.0546, -80.4542] },
  "DXB": { name: "Riobamba", coords: [-1.6709, -78.6475] },
  "SAO": { name: "Tena", coords: [-0.9938, -77.8129] },
  "MUM": { name: "Coca", coords: [-0.4665, -76.9871] },

  // Network nodes
  "Node 1": { name: "Esmeraldas (Nodo 1)", coords: [0.9682, -79.6517] },
  "Node_1": { name: "Esmeraldas (Nodo 1)", coords: [0.9682, -79.6517] },
  "Node 2": { name: "Ibarra (Nodo 2)", coords: [0.3517, -78.1222] },
  "Node_2": { name: "Ibarra (Nodo 2)", coords: [0.3517, -78.1222] },
  "Node 3": { name: "Santo Domingo (Nodo 3)", coords: [-0.2530, -79.1754] },
  "Node_3": { name: "Santo Domingo (Nodo 3)", coords: [-0.2530, -79.1754] },
  "Node 4": { name: "Riobamba (Nodo 4)", coords: [-1.6709, -78.6475] },
  "Node_4": { name: "Riobamba (Nodo 4)", coords: [-1.6709, -78.6475] },
  "Node 5": { name: "Loja (Nodo 5)", coords: [-3.9931, -79.2042] },
  "Node_5": { name: "Loja (Nodo 5)", coords: [-3.9931, -79.2042] },
  "Node 6": { name: "Tena (Nodo 6)", coords: [-0.9938, -77.8129] },
  "Node_6": { name: "Tena (Nodo 6)", coords: [-0.9938, -77.8129] },
};

function getCityInfo(key: string) {
  if (!key) return null;
  const clean = key.split('_')[0].trim();
  let info = ECUADOR_CITIES[clean] || ECUADOR_CITIES[key];
  
  if (!info) {
    const searchName = clean.toLowerCase();
    const found = Object.values(ECUADOR_CITIES).find(v => v.name.toLowerCase() === searchName);
    if (found) info = found;
  }

  if (!info && key.toLowerCase().startsWith("node")) {
    const num = key.replace(/\D/g, "");
    info = ECUADOR_CITIES[`Node ${num}`] || ECUADOR_CITIES[`Node_${num}`];
  }
  return info || null;
}

function LogisticsMap({ dark, routes, defaultCenter = [-1.8312, -78.1834], defaultZoom = 7 }: { dark: boolean; routes?: Array<{ from: string; to: string; units: number; active: boolean }>; defaultCenter?: [number, number]; defaultZoom?: number }) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMapMounted = true;
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) {
      console.warn("Leaflet library not loaded yet.");
      return;
    }

    // Initialize map focused strictly on Ecuador, locking user zoom and bounds.
    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      minZoom: 6,
      maxZoom: 11,
      maxBounds: [[-5.2, -82.0], [2.2, -74.5]], // Bounding box limits for Ecuador
      zoomControl: true,
    });

    const tileUrl = dark 
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    L.tileLayer(tileUrl, { attribution }).addTo(map);

    if (routes && routes.length > 0) {
      const markersAdded = new Set<string>();

      routes.forEach(r => {
        const fromInfo = getCityInfo(r.from);
        const toInfo = getCityInfo(r.to);

        if (fromInfo && toInfo) {
          // Source marker
          if (!markersAdded.has(r.from)) {
            L.marker(fromInfo.coords, {
              icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: ${dark ? '#3B82F6' : '#1345A8'}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.3);"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              })
            }).addTo(map).bindPopup(`<b>${fromInfo.name}</b>`);
            markersAdded.add(r.from);
          }

          // Target marker
          if (!markersAdded.has(r.to)) {
            L.marker(toInfo.coords, {
              icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: ${r.active ? '#10B981' : '#EF4444'}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.3);"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              })
            }).addTo(map).bindPopup(`<b>${toInfo.name}</b>`);
            markersAdded.add(r.to);
          }

          // Render direct path synchronously first (as fallback)
          const color = r.active ? (dark ? "#10B981" : "#059669") : (dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)");
          const weight = r.active ? 3 : 1.5;
          const poly = L.polyline([fromInfo.coords, toInfo.coords], {
            color: color,
            weight: weight,
            dashArray: r.active ? undefined : '5, 5',
            opacity: r.active ? 0.9 : 0.4
          }).addTo(map);

          if (r.active) {
            poly.bindPopup(`<b>Ruta Activa (Directa):</b> ${fromInfo.name} &rarr; ${toInfo.name}<br/><b>Flujo:</b> ${r.units} unidades`);
          }

          // Fetch real driving route from OSRM asynchronously
          fetch(`https://router.project-osrm.org/route/v1/driving/${fromInfo.coords[1]},${fromInfo.coords[0]};${toInfo.coords[1]},${toInfo.coords[0]}?overview=full&geometries=geojson`)
            .then(res => res.json())
            .then(data => {
              if (!isMapMounted) return;
              if (data.code === "Ok" && data.routes && data.routes[0]) {
                const coords = data.routes[0].geometry.coordinates;
                const latlngs = coords.map((c: [number, number]) => [c[1], c[0]]);
                poly.setLatLngs(latlngs);
                if (r.active) {
                  poly.bindPopup(`<b>Ruta Activa (Vial):</b> ${fromInfo.name} &rarr; ${toInfo.name}<br/><b>Flujo:</b> ${r.units} unidades`);
                }
              }
            })
            .catch(err => {
              console.warn("OSRM routing failed, keeping straight path:", err);
            });
        }
      });
    } else {
      // Overview mode
      HUBS.forEach(hub => {
        const info = getCityInfo(hub.id);
        if (info) {
          L.marker(info.coords, {
            icon: L.divIcon({
              className: 'custom-div-icon',
              html: `<div style="background-color: ${dark ? '#0EA5E9' : '#1345A8'}; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.3)"></div>`,
              iconSize: [10, 10],
              iconAnchor: [5, 5]
            })
          }).addTo(map).bindPopup(`<b>Hub:</b> ${info.name}`);
        }
      });

      ROUTES.forEach(r => {
        const fromInfo = getCityInfo(r.from);
        const toInfo = getCityInfo(r.to);
        if (fromInfo && toInfo) {
          const color = r.active ? (dark ? "#0EA5E9" : "#1345A8") : (dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)");
          
          // Render direct path synchronously first (as fallback)
          const poly = L.polyline([fromInfo.coords, toInfo.coords], {
            color,
            weight: r.active ? 2 : 1,
            dashArray: r.active ? undefined : '3, 3',
            opacity: r.active ? 0.8 : 0.4
          }).addTo(map);

          // Fetch real driving route from OSRM asynchronously
          fetch(`https://router.project-osrm.org/route/v1/driving/${fromInfo.coords[1]},${fromInfo.coords[0]};${toInfo.coords[1]},${toInfo.coords[0]}?overview=full&geometries=geojson`)
            .then(res => res.json())
            .then(data => {
              if (!isMapMounted) return;
              if (data.code === "Ok" && data.routes && data.routes[0]) {
                const coords = data.routes[0].geometry.coordinates;
                const latlngs = coords.map((c: [number, number]) => [c[1], c[0]]);
                poly.setLatLngs(latlngs);
              }
            })
            .catch(err => {
              console.warn("OSRM routing failed, keeping straight path:", err);
            });
        }
      });
    }

    return () => {
      isMapMounted = false;
      map.remove();
    };
  }, [dark, routes, defaultCenter, defaultZoom]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-border" style={{ height: "600px" }}>
      <div ref={mapRef} className="w-full h-full" style={{ zIndex: 1 }} />
      <div className="absolute top-2 right-3 flex items-center gap-1.5 px-2 py-1 rounded bg-background/80 border border-border backdrop-blur-sm" style={{ zIndex: 400 }}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">MAPA ACTIVO</span>
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
          <LogisticsMap dark={dark} defaultCenter={[-1.8312, -78.1834]} defaultZoom={7} />
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
  const transportData = modelData?.data;

  const displayPlan = activeSolution && Array.isArray(activeSolution.variables) ? activeSolution.variables.map((v: any) => ({
    route: `${v.origin.replace(/_/g, ' ')} → ${v.destination.replace(/_/g, ' ')}`,
    units: v.units,
    cost: v.cost,
    pct: Math.round((v.units / 240) * 100),
    status: "Optimal"
  })) : transportPlan;

  const totalCost = activeSolution && activeSolution.objectiveValue !== undefined ? activeSolution.objectiveValue : 8440;

  const mapRoutes = activeSolution && Array.isArray(activeSolution.variables) ? activeSolution.variables.map((v: any) => ({
    from: v.origin,
    to: v.destination,
    units: v.units,
    active: v.units > 0
  })) : [
    { from: "Quito", to: "Manta", units: 240, active: true },
    { from: "Guayaquil", to: "Guayaquil", units: 100, active: false },
    { from: "Cuenca", to: "Cuenca", units: 100, active: false },
  ];

  const destinations = transportData?.destinations || ["Manta", "Loja", "Machala", "Ambato"];
  const headers = [...destinations, "Oferta"];

  const matrixRows = transportData ? transportData.origins.map((origin: string, i: number) => {
    return {
      origin: origin.replace(/_/g, ' '),
      costs: transportData.costs[i],
      supply: transportData.supply[i]
    };
  }) : costMatrix.slice(0, 3).map(row => ({
    origin: row.origin,
    costs: [row.manta, row.loja, row.machala, row.ambato],
    supply: row.supply
  }));

  const demandRow = {
    origin: "Demanda",
    costs: transportData?.demand || [140, 160, 120, 160],
    supply: null
  };
  
  const allRows = [...matrixRows, demandRow];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHeader title="Mapa Real de Rutas de Transporte" sub="Orígenes y destinos óptimos calculados visualizados en mapa real" />
        <div className="p-4">
          <LogisticsMap dark={dark} routes={mapRoutes} defaultCenter={[-1.8312, -78.1834]} defaultZoom={7} />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Matriz de Costos ($/unidad)" sub="Costos de envío, demanda y oferta por cada ubicación" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground">Origen \ Destino</th>
                  {headers.map(h => (
                    <th key={h} className="text-center px-3 py-2.5 text-[10px] font-mono text-muted-foreground">{typeof h === 'string' ? h.replace(/_/g, ' ') : h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allRows.map((row, i) => {
                  const isDemand = i === allRows.length - 1;
                  return (
                    <tr key={i} className={`${isDemand ? "border-t-2 border-border bg-secondary/20" : "hover:bg-secondary/30"} transition-colors`}>
                      <td className="px-5 py-3 font-mono text-foreground text-[11px]">{row.origin}</td>
                      {row.costs.map((v: number, j: number) => (
                        <td key={j} className={`text-center px-3 py-3 font-mono font-semibold text-[11px] ${isDemand ? "text-primary" : "text-foreground"}`}>
                          {isDemand ? v : `$${v}`}
                        </td>
                      ))}
                      <td className={`text-center px-3 py-3 font-mono font-bold text-[11px] ${!isDemand ? "text-primary" : "text-muted-foreground"}`}>
                        {row.supply !== null ? row.supply : "—"}
                      </td>
                    </tr>
                  );
                })}
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
  const netData = modelData?.data;

  let displayNodes: any[] = [];
  let mapRoutes: any[] = [];

  if (activeSolution && activeSolution.variables) {
    // Build mapRoutes from netData.edges so the entire network is always visible
    mapRoutes = netData?.edges?.map((e: any) => ({
      from: e.source.replace(/_/g, ' '),
      to: e.target.replace(/_/g, ' '),
      units: 0,
      active: false
    })) || [];

    if (Array.isArray(activeSolution.variables)) {
      // Shortest path format: ['Guayaquil', 'Santo Domingo', 'Quito']
      const path = activeSolution.variables;
      for (let i = 0; i < path.length - 1; i++) {
        const src = path[i];
        const tgt = path[i + 1];
        const edge = netData?.edges?.find((e: any) => e.source === src && e.target === tgt);
        const cost = edge ? edge.weight : 0;
        displayNodes.push({
          node: `${src.replace(/_/g, ' ')} → ${tgt.replace(/_/g, ' ')}`,
          type: "Active Arc",
          flow_in: 1, flow_out: 1, excess: 1, cost: cost
        });
        
        // Update mapRoutes to highlight the path
        const mapSrc = src.replace(/_/g, ' ');
        const mapTgt = tgt.replace(/_/g, ' ');
        const route = mapRoutes.find(r => r.from === mapSrc && r.to === mapTgt);
        if (route) {
          route.active = true;
          route.units = 1;
        }
      }
    } else {
      // Min cost flow / Max flow format
      displayNodes = Object.entries(activeSolution.variables).flatMap(([src, targets]: [string, any]) =>
        Object.entries(targets).map(([tgt, flow]: [string, any]) => {
          const edge = netData?.edges?.find((e: any) => e.source === src && e.target === tgt);
          const cost = edge ? edge.weight * flow : 0;
          return {
            node: `${src.replace(/_/g, ' ')} → ${tgt.replace(/_/g, ' ')}`,
            type: flow > 0 ? "Active Arc" : "Inactive Arc",
            flow_in: flow, flow_out: flow, excess: flow > 0 ? flow : 0, cost: cost
          };
        })
      ).filter(r => r.flow_in > 0);

      Object.entries(activeSolution.variables).forEach(([src, targets]: [string, any]) => {
        Object.entries(targets).forEach(([tgt, flow]: [string, any]) => {
          if (flow > 0) {
            const route = mapRoutes.find(r => r.from === src.replace(/_/g, ' ') && r.to === tgt.replace(/_/g, ' '));
            if (route) {
              route.active = true;
              route.units = flow;
            }
          }
        });
      });
    }
  }

  const totalCost = activeSolution?.objectiveValue ?? 0;

  // Generate Cumulative Cost Data for LineChart
  const cumulativeData: any[] = [];
  let cumSum = 0;
  if (displayNodes) {
    displayNodes.forEach((r, i) => {
      cumSum += r.cost;
      cumulativeData.push({
        step: i + 1,
        route: r.node,
        cost: r.cost,
        cumulative: cumSum
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHeader title="Mapa Real de Flujo de Redes" sub="Visualización interactiva de rutas y flujos óptimos en Ecuador" />
        <div className="p-4">
          <LogisticsMap dark={dark} routes={mapRoutes} defaultCenter={[-1.8312, -78.1834]} defaultZoom={7} />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Nodos Input Table - Only relevant for Min Cost Flow */}
        {netData?.algorithm === 'min_cost_flow' && (
          <Card>
            <SectionHeader title="Nodos del Sistema" sub="Oferta y Demanda de cada ciudad" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Ciudad / Nodo", "Tipo", "Oferta / Demanda (Unidades)"].map(h => (
                      <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {netData?.nodes?.map((node: string, i: number) => {
                    const demand = netData.demands?.[node] || 0;
                    const type = demand < 0 ? "Planta (Oferta)" : demand > 0 ? "Cliente (Demanda)" : "Transbordo";
                    return (
                      <tr key={i} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-[11px] text-foreground">{node.replace(/_/g, ' ')}</td>
                        <td className="px-5 py-3">
                          <Badge label={type} variant={demand < 0 ? "info" : demand > 0 ? "warning" : "default"} />
                        </td>
                        <td className={`px-5 py-3 font-mono font-semibold ${demand < 0 ? "text-emerald-600" : demand > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {Math.abs(demand)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Edges Input Table */}
        <Card>
          <SectionHeader title="Arcos (Rutas Posibles)" sub="Conexiones, capacidades y costos de envío" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Origen", "Destino", "Costo Unitario", "Capacidad Máx."].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {netData?.edges?.map((edge: any, i: number) => (
                  <tr key={i} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-foreground">{edge.source.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 font-mono text-foreground">{edge.target.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-primary">${edge.weight}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground">{edge.capacity} u.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Flow Analysis Table */}
        <Card>
          <SectionHeader title="Análisis de Flujo Óptimo" sub={`Costo total mínimo: $${totalCost.toLocaleString()}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Ruta Activa", "Flujo Enviado", "Costo Total de Ruta"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayNodes ? displayNodes.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-[11px] text-foreground">{r.node}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-emerald-600">{r.excess} u.</td>
                    <td className="px-5 py-3 font-mono font-semibold text-primary">${(r.cost ?? 0).toLocaleString()}</td>
                  </tr>
                )) : null}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Line Chart */}
        <Card>
          <SectionHeader title="Costos Acumulados por Ruta" sub="Progresión del costo al sumar las rutas óptimas" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cumulativeData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                <XAxis dataKey="step" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 11, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip dark={dark} />} />
                <Line type="monotone" dataKey="cumulative" name="Costo Acumulado" stroke={dark ? "#10B981" : "#059669"} strokeWidth={3} dot={{ r: 4, fill: dark ? "#10B981" : "#059669" }} />
                <Line type="monotone" dataKey="cost" name="Costo Ruta" stroke={dark ? "#3B82F6" : "#1345A8"} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3, fill: dark ? "#3B82F6" : "#1345A8" }} />
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
  overview:    "Bienvenido al Centro de Control. Como tu Consultor Ejecutivo, estoy listo para interpretar los indicadores clave y diagnosticar oportunidades de mejora en tu cadena de suministro.",
  lp:          "Módulo de Optimización de Recursos. ¿Deseas que analice los resultados o que evaluemos los ahorros potenciales de tus recursos?",
  transport:   "Módulo de Distribución y Transporte. Estoy listo para evaluar el costo total de distribución y recomendar ajustes en tus rutas.",
  networks:    "Módulo de Redes Logísticas. ¿Quieres que analicemos los flujos de distribución o identifiquemos los cuellos de botella en la red?",
  ip:          "Módulo de Decisiones Estratégicas. ¿Procedemos a evaluar las opciones de inversión o asignación?",
  dp:          "Módulo de Planificación por Etapas. ¿Revisamos la política óptima y los costos acumulados por período?",
  inventories: "Módulo de Inventarios. ¿Te gustaría analizar los niveles óptimos de pedido y los costos de almacenamiento?",
};

function AiTutor({ dark, activeModule, activeModelData, onUpdateModelData }: { dark: boolean; activeModule: ModuleId; activeModelData?: any; onUpdateModelData?: (newJson: string) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevModule = useRef<ModuleId | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfName, setPdfName] = useState<string | null>(null);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingPdf(true);
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const response = await fetch("http://localhost:4000/api/tutor/upload", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        setPdfName(file.name);
        setMessages(m => [...m, { role: "assistant", text: `📚 ¡Excelente! He leído tu documento "${file.name}" y lo he guardado en mi memoria vectorial. Ya puedes hacerme preguntas sobre él.` }]);
      } else {
        setMessages(m => [...m, { role: "assistant", text: `Error al leer el PDF: ${data.error}` }]);
      }
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", text: "Error de conexión al subir el PDF." }]);
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
          })),
          currentModelData: activeModelData?.data || null
        })
      });

      const resData = await response.json();
      setTyping(false);

      if (resData.status === "success" && resData.reply) {
        setMessages(m => [...m, { role: "assistant", text: resData.reply }]);

        // Handle data update action from Tool Calling
        if (resData.action === "UPDATE_MODEL" && resData.newModelData && onUpdateModelData) {
          onUpdateModelData(JSON.stringify(resData.newModelData, null, 2));
        }
      } else {
        setMessages(m => [...m, { role: "assistant", text: "Hubo un problema al procesar tu solicitud. Verifica la conexión del servidor." }]);
      }
    } catch (error) {
      setTyping(false);
      setMessages(m => [...m, { role: "assistant", text: "Error de conexión con el Asistente IA. Asegúrate de que el backend está corriendo." }]);
    }
  };

  const bg = dark ? "#0C0C10" : "#FFFFFF";
  const border = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const accent = dark ? "#3B82F6" : "#1345A8";

  return (
    <>
      {/* Toggle button — only visible when chat is closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105"
          style={{ background: accent, boxShadow: `0 4px 20px ${accent}50` }}
        >
          <Brain size={18} className="text-white" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[440px] rounded-xl overflow-hidden flex flex-col"
          style={{
            background: bg,
            border: `1px solid ${border}`,
            boxShadow: dark ? "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)" : "0 20px 60px rgba(0,0,0,0.15)",
            height: 620,
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2.5 border-b" style={{ borderColor: border }}>
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: accent }}>
              <Brain size={12} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: dark ? "#E2E8F0" : "#0D1B2A" }}>Asistente IA</p>
              <p className="text-[10px] font-mono" style={{ color: dark ? "#3B82F6" : "#1345A8" }}>
                {MODULES.find(m => m.id === activeModule)?.shortLabel} · Llama 3.3
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <button
                onClick={() => setOpen(false)}
                className="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
                title="Minimizar"
              >
                <Minus size={14} style={{ color: dark ? "#6B7280" : "#9CA3AF" }} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "assistant" && (
                  <span className="text-[9px] font-mono mb-1" style={{ color: dark ? "#6B7280" : "#9CA3AF" }}>ASISTENTE IA</span>
                )}
                <div
                  className="max-w-[95%] text-xs leading-relaxed px-3 py-2.5 rounded-lg"
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
                  {m.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({children, ...props}) => <table className="w-full text-[11px] my-2 border-collapse" {...props}>{children}</table>,
                        thead: ({children, ...props}) => <thead className="border-b border-white/10" {...props}>{children}</thead>,
                        th: ({children, ...props}) => <th className="text-left px-2 py-1 font-semibold text-[10px] uppercase tracking-wide opacity-70" {...props}>{children}</th>,
                        td: ({children, ...props}) => <td className="px-2 py-1 border-t border-white/5" {...props}>{children}</td>,
                        strong: ({children, ...props}) => <strong className="font-bold" style={{ color: dark ? "#60A5FA" : "#1345A8" }} {...props}>{children}</strong>,
                        ul: ({children, ...props}) => <ul className="list-disc pl-4 my-1 space-y-0.5" {...props}>{children}</ul>,
                        ol: ({children, ...props}) => <ol className="list-decimal pl-4 my-1 space-y-0.5" {...props}>{children}</ol>,
                        h3: ({children, ...props}) => <h3 className="text-sm font-bold mt-2 mb-1" {...props}>{children}</h3>,
                        p: ({children, ...props}) => <p className="mb-1.5 last:mb-0" {...props}>{children}</p>,
                      }}
                    >{m.text}</ReactMarkdown>
                  ) : (
                    m.text
                  )}
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
          <div className="px-4 py-3 border-t flex flex-col gap-2" style={{ borderColor: border }}>
            {pdfName && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 w-fit">
                <Check size={10} />
                <span className="text-[9px] font-mono font-bold truncate max-w-[150px]">{pdfName}</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: dark ? "rgba(255,255,255,0.05)" : "#F4F7F6", border: `1px solid ${border}` }}>
              <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={uploadingPdf}
                className="shrink-0 transition-opacity hover:opacity-70 disabled:opacity-30"
              >
                <Paperclip size={14} style={{ color: dark ? "#6B7280" : "#9CA3AF" }} />
              </button>
              <input
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: dark ? "#E2E8F0" : "#0D1B2A", fontFamily: "DM Mono, monospace" }}
                placeholder={uploadingPdf ? "Leyendo PDF..." : "Pregunta algo..."}
                value={input}
                disabled={uploadingPdf}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
              />
              <button onClick={send} disabled={uploadingPdf} className="shrink-0 transition-opacity hover:opacity-70 disabled:opacity-30">
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

  const handleSaveAndSolve = async (dataToSave?: any) => {
    if ((jsonError && !dataToSave) || !activeModelData) return;
    setSolving(true);
    try {
      const parsedData = dataToSave || JSON.parse(jsonText);
      const response = await fetch(`http://localhost:4000/api/models/${activeModelData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsedData })
      });
      const result = await response.json();
      if (result.status === "success" && result.data) {
        setDbModels(prev => prev.map(m => m.id === activeModelData.id ? result.data : m));
        setEditing(false);
        // Ocultar la alerta molesta para una mejor UX cuando la IA actualiza
        if (!dataToSave) {
          alert("¡Parámetros guardados y modelo resuelto con éxito!");
        }
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
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs opacity-40 cursor-not-allowed"
              style={{ background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${borderColor}`, color: textMuted }}
              title="Próximamente">
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

            <button className="relative p-1.5 rounded transition-colors opacity-40 cursor-not-allowed" style={{ color: textMuted }} title="Próximamente">
              <Bell size={16} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
            </button>

            <button className="p-1.5 rounded transition-colors opacity-40 cursor-not-allowed" style={{ color: textMuted }} title="Próximamente">
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
                        onClick={() => handleSaveAndSolve()}
                        disabled={solving || !!jsonError}
                        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded font-semibold disabled:opacity-50"
                      >
                        {solving ? "Guardando..." : "Guardar y Resolver"}
                      </button>
                    </div>
                  }
                />
                <div className="p-4 flex flex-col gap-2">
                  {activeModule === "transport" ? (
                    <TransportEditor jsonText={jsonText} onChange={handleJsonChange} dark={dark} />
                  ) : (activeModule === "lp" || activeModule === "ip") ? (
                    <LPEditor jsonText={jsonText} onChange={handleJsonChange} dark={dark} />
                  ) : activeModule === "networks" ? (
                    <NetworksEditor jsonText={jsonText} onChange={handleJsonChange} dark={dark} />
                  ) : activeModule === "dp" ? (
                    <DynamicEditor jsonText={jsonText} onChange={handleJsonChange} dark={dark} />
                  ) : activeModule === "inventories" ? (
                    <InventoriesEditor jsonText={jsonText} onChange={handleJsonChange} dark={dark} />
                  ) : (
                    <>
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
                    </>
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
      <AiTutor dark={dark} activeModule={activeModule} activeModelData={activeModelData} onUpdateModelData={(newJson) => { handleJsonChange(newJson); setEditing(true); handleSaveAndSolve(JSON.parse(newJson)); }} />

      <style>{`
        * { scrollbar-width: none; }
        *::-webkit-scrollbar { display: none; }
        .leaflet-container, 
        .leaflet-container *, 
        .leaflet-grab, 
        .leaflet-grabbing, 
        .leaflet-pane, 
        .leaflet-tile-pane,
        .leaflet-map-pane {
          cursor: default !important;
        }
        .custom-div-icon, 
        .leaflet-marker-icon, 
        .leaflet-interactive, 
        .leaflet-control-zoom-in, 
        .leaflet-control-zoom-out, 
        .leaflet-control-zoom a {
          cursor: pointer !important;
        }
      `}</style>
    </div>
  );
}
