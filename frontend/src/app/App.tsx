import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import { useParams, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend,
  ScatterChart, Scatter, ReferenceLine,
} from "recharts";
import {
  Sun, Moon, TrendingUp, Truck, Network, GitBranch, Layers, Package,
  LayoutDashboard, MessageSquare, X, Send, Search, Settings,
  ChevronRight, Download, RefreshCw, Filter, MapPin, Activity,
  ArrowUpRight, ArrowDownRight, Brain, Zap, Menu, Globe,
  AlertTriangle, CheckCircle2, Clock, Info, ChevronDown,
  ChevronsLeft, ChevronsRight, Terminal, Paperclip, Check, Trash2
} from "lucide-react";
import { TransportEditor } from "../components/TransportEditor";
import { LPEditor } from "../components/LPEditor";
import { NetworksEditor } from "../components/NetworksEditor";
import { DynamicEditor } from "../components/DynamicEditor";
import { InventoriesEditor } from "../components/InventoriesEditor";
import { AlgorithmSteps } from "../components/AlgorithmSteps";

// Se arma a partir del host con el que se abrió la página (no un "localhost"
// fijo): así funciona igual si se accede desde la misma PC o desde otra en la
// red local usando la IP del servidor (ej. http://192.168.1.5:5173).
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:4000`;

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
  { id: "transport",  label: "Modelo de Transporte",     shortLabel: "Transporte",  icon: Truck,           description: "Optimización de rutas y transportistas" },
  { id: "networks",   label: "Modelos de Redes",         shortLabel: "Redes",       icon: Network,         description: "Flujo de costo mínimo y enrutamiento" },
  { id: "ip",         label: "Programación Entera",      shortLabel: "PE / MIP",    icon: GitBranch,       description: "Algoritmo Branch & Bound" },
  { id: "dp",         label: "Programación Dinámica",    shortLabel: "PD",          icon: Layers,          description: "Ecuaciones de Bellman y etapas" },
  { id: "inventories",label: "Control de Inventarios",   shortLabel: "Inventarios", icon: Package,         description: "Lote Económico (EOQ) y análisis ABC", badge: "Nuevo" },
];

// El tipo de modelo en la base de datos (Prisma) no coincide 1:1 con el ModuleId de la UI
// ("dp" en la UI vs. "DYNAMIC" en la DB, "ip" reutiliza el mismo modelo "LP"), y la ruta del
// solver tampoco ("dp" -> /api/dynamic/solve). Un solo mapeo evita repetir ese desfase en cada
// lugar que busca el modelo activo.
const MODULE_TO_DB_TYPE: Record<ModuleId, string> = {
  overview: "", lp: "LP", ip: "LP", transport: "TRANSPORT", networks: "NETWORKS", dp: "DYNAMIC", inventories: "INVENTORIES",
};

// ─── Data ────────────────────────────────────────────────────────────────────

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, dark }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`rounded border px-3 py-2 text-xs shadow-lg ${dark ? "bg-[#1C1F26] border-white/10 text-[#E2E8F0]" : "bg-white border-black/8 text-[#0D1B2A]"}`}>
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

function EmptyState({ dark, title, sub }: { dark: boolean; title: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center gap-2"
    >
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
        style={{ background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }}>
        <Terminal size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{sub}</p>
    </motion.div>
  );
}

// Formatea un conjunto de coeficientes {nombre: coef} como expresión lineal legible, ej. "5x1 - 2x2".
function formatLinearExpr(terms?: Record<string, number>): string {
  if (!terms) return "";
  const entries = Object.entries(terms).filter(([, c]) => c !== 0);
  if (entries.length === 0) return "0";
  return entries.map(([name, coef], i) => {
    const sign = coef < 0 ? "-" : "+";
    const abs = Math.abs(coef);
    const coefStr = abs === 1 ? "" : `${abs}`;
    if (i === 0) return coef < 0 ? `-${coefStr}${name}` : `${coefStr}${name}`;
    return ` ${sign} ${coefStr}${name}`;
  }).join("");
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

// Referencia estable (misma identidad de array en cada render) para el centro
// por defecto del mapa: si se pasara un literal `[a, b]` inline en el JSX se
// recrearía en cada render y el useEffect de LogisticsMap (que depende de la
// identidad de defaultCenter) reiniciaría el mapa entero innecesariamente.
const ECUADOR_DEFAULT_CENTER: [number, number] = [-1.8312, -78.1834];

const ECUADOR_CITIES: Record<string, { name: string, coords: [number, number] }> = {
  // Transport hubs
  "Seattle": { name: "Quito", coords: [-0.1807, -78.4678] },
  "Denver": { name: "Manta", coords: [-0.9621, -80.7127] },
  "Chicago": { name: "Guayaquil", coords: [-2.1894, -79.8890] },
  "Miami": { name: "Cuenca", coords: [-2.9001, -79.0059] },
  "New York": { name: "Ambato", coords: [-1.2491, -78.6273] },
  "New_York": { name: "Ambato", coords: [-1.2491, -78.6273] },
  "Dallas": { name: "Santo Domingo", coords: [-0.2530, -79.1754] },
  "Atlanta": { name: "Ibarra", coords: [0.3517, -78.1222] },

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

// ─── Mapbox ─────────────────────────────────────────────────────────────────
// Token público (pk.*): diseñado para exponerse en el cliente, restringible por
// dominio desde el dashboard de Mapbox. Se inyecta en build time vía Vite.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
if (typeof window !== "undefined" && (window as any).mapboxgl && MAPBOX_TOKEN) {
  (window as any).mapboxgl.accessToken = MAPBOX_TOKEN;
}

// Todas las coordenadas de la app se manejan como [lat, lng] (igual que antes
// con Leaflet); esta función solo convierte al orden [lng, lat] que exige la
// API de Mapbox GL justo en el borde donde se llama a sus métodos.
function toLngLat([lat, lng]: [number, number]): [number, number] {
  return [lng, lat];
}

// ─── Geocodificación real vía Mapbox ───────────────────────────────────────────
// Los resultados se cachean en localStorage para no repetir búsquedas ya resueltas.
const GEOCODE_CACHE_KEY = "tl_geocode_cache_v2";

function loadGeocodeCache(): Record<string, [number, number]> {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGeocodeCache(cache: Record<string, [number, number]>) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage lleno o no disponible; no es crítico, se recalculará después.
  }
}

const geocodeCache: Record<string, [number, number]> = loadGeocodeCache();

// Busca coordenadas reales vía la Geocoding API de Mapbox para un nombre de
// lugar (ej. "Cayambe"), restringido a Ecuador. Devuelve null si no lo
// encuentra, si falla la red, o si no hay token configurado.
async function geocodePlaceMapbox(name: string): Promise<[number, number] | null> {
  const key = name.trim().toLowerCase();
  if (!key || !MAPBOX_TOKEN) return null;
  if (geocodeCache[key]) return geocodeCache[key];

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json?access_token=${MAPBOX_TOKEN}&country=ec&limit=1&language=es`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data?.features?.[0];
    if (feature?.center) {
      // Mapbox devuelve [lng, lat]; lo guardamos como [lat, lng] para ser
      // consistente con el resto de la tabla de coordenadas de la app.
      const coords: [number, number] = [feature.center[1], feature.center[0]];
      geocodeCache[key] = coords;
      saveGeocodeCache(geocodeCache);
      return coords;
    }
  } catch (err) {
    console.warn("Geocodificación Mapbox falló para", name, err);
  }
  return null;
}

// Número estable en [0,1) a partir de un string: último recurso para ubicar
// nodos que ni la tabla conocida ni OpenStreetMap pudieron resolver.
function hashStringToUnit(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 100000) / 100000;
}

function hashToEcuadorCoords(key: string): [number, number] {
  const latRange: [number, number] = [-4.2, 1.2];
  const lngRange: [number, number] = [-81.0, -75.5];
  const lat = latRange[0] + hashStringToUnit(`${key}_lat`) * (latRange[1] - latRange[0]);
  const lng = lngRange[0] + hashStringToUnit(`${key}_lng`) * (lngRange[1] - lngRange[0]);
  return [lat, lng];
}

// Solo consulta la tabla local de ciudades/hubs conocidos, sin red y sin fallback.
function getKnownCityInfo(key: string): { name: string; coords: [number, number] } | null {
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

// Resuelve coordenadas para un conjunto de nombres de nodo: primero la tabla
// conocida (instantáneo), luego Mapbox (nombre real, cacheado), y como último
// recurso una coordenada estable por hash para que el mapa nunca se quede sin
// puntos aunque Mapbox no encuentre el lugar.
async function resolveNodeCoords(keys: string[]): Promise<Map<string, { name: string; coords: [number, number] }>> {
  const result = new Map<string, { name: string; coords: [number, number] }>();
  for (const key of keys) {
    const known = getKnownCityInfo(key);
    if (known) {
      result.set(key, known);
      continue;
    }
    const geo = await geocodePlaceMapbox(key);
    result.set(key, geo ? { name: key, coords: geo } : { name: key, coords: hashToEcuadorCoords(key) });
  }
  return result;
}

function LogisticsMap({ dark, routes, defaultCenter = ECUADOR_DEFAULT_CENTER, defaultZoom = 7, onRouteDistance }: { dark: boolean; routes?: Array<{ from: string; to: string; units: number; active: boolean }>; defaultCenter?: [number, number]; defaultZoom?: number; onRouteDistance?: (key: string, distanceKm: number) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  // Se guarda en un ref para poder llamar siempre a la versión más reciente
  // del callback desde dentro del efecto del mapa, sin tener que incluirlo en
  // las dependencias (eso forzaría recrear el mapa completo en cada render).
  const onRouteDistanceRef = useRef(onRouteDistance);
  useEffect(() => { onRouteDistanceRef.current = onRouteDistance; }, [onRouteDistance]);

  useEffect(() => {
    let isMapMounted = true;
    if (!mapRef.current) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) {
      console.warn("Mapbox GL library not loaded yet.");
      return;
    }
    if (!MAPBOX_TOKEN) {
      console.warn("VITE_MAPBOX_TOKEN no está configurado; el mapa no puede inicializarse.");
      return;
    }

    // Initialize map focused strictly on Ecuador, locking user zoom y bounds.
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
      center: toLngLat(defaultCenter),
      zoom: defaultZoom,
      minZoom: 6,
      maxZoom: 18,
      maxBounds: [[-82.0, -5.2], [-74.5, 2.2]], // esquinas [lng,lat] SO/NE de Ecuador
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

    // Mapbox GL solo lee el tamaño del contenedor una vez al crear el mapa; si
    // el layout todavía se está acomodando (ej. animación de entrada de
    // Framer Motion, sidebar colapsando), el canvas queda con una matriz de
    // proyección basada en un tamaño viejo y los marcadores/rutas se dibujan
    // desplazados. Un ResizeObserver mantiene el mapa sincronizado con el
    // tamaño real del contenedor en todo momento.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapRef.current);

    const markers: any[] = [];
    let routeSeq = 0;

    function addMarker(coords: [number, number], color: string, size: number, popupHtml: string) {
      const el = document.createElement("div");
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderRadius = "50%";
      el.style.background = color;
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 0 8px rgba(0,0,0,0.3)";
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(toLngLat(coords))
        .setPopup(new mapboxgl.Popup({ offset: size + 4 }).setHTML(popupHtml))
        .addTo(map);
      markers.push(marker);
    }

    // Dibuja la línea recta (fallback inmediato) y la deja lista para que
    // updateRouteLine() la reemplace con la geometría vial real de Mapbox
    // Directions una vez que llegue la respuesta.
    function addRouteLine(id: string, fromCoords: [number, number], toCoords: [number, number], color: string, weight: number, opacity: number, dashed: boolean, popupState?: { html: string }) {
      map.addSource(id, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [toLngLat(fromCoords), toLngLat(toCoords)] } }
      });
      map.addLayer({
        id,
        type: "line",
        source: id,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": color,
          "line-width": weight,
          "line-opacity": opacity,
          ...(dashed ? { "line-dasharray": [2, 2] } : {})
        }
      });
      if (popupState) {
        map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
        map.on("click", id, (e: any) => {
          new mapboxgl.Popup({ offset: 6 }).setLngLat(e.lngLat).setHTML(popupState.html).addTo(map);
        });
      }
    }

    function updateRouteLine(id: string, lngLatCoords: [number, number][]) {
      const source = map.getSource(id);
      if (source) {
        source.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: lngLatCoords } });
      }
    }

    map.on("load", () => {
      if (!isMapMounted) return;

      if (routes && routes.length > 0) {
        // Resuelve coordenadas reales (tabla conocida -> Mapbox -> hash) para
        // todos los nodos únicos ANTES de dibujar, así los marcadores y rutas
        // usan de una vez la ubicación real cuando Mapbox la encuentra.
        const uniqueKeys = Array.from(new Set(routes.flatMap(r => [r.from, r.to])));
        resolveNodeCoords(uniqueKeys).then(coordsByKey => {
          if (!isMapMounted) return;
          const markersAdded = new Set<string>();

          routes.forEach(r => {
            const fromInfo = coordsByKey.get(r.from);
            const toInfo = coordsByKey.get(r.to);
            if (!fromInfo || !toInfo) return;

            if (!markersAdded.has(r.from)) {
              addMarker(fromInfo.coords, dark ? "#3B82F6" : "#1345A8", 12, `<b>${fromInfo.name}</b>`);
              markersAdded.add(r.from);
            }
            if (!markersAdded.has(r.to)) {
              addMarker(toInfo.coords, r.active ? "#10B981" : "#EF4444", 12, `<b>${toInfo.name}</b>`);
              markersAdded.add(r.to);
            }

            const color = r.active ? (dark ? "#10B981" : "#059669") : (dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)");
            const weight = r.active ? 3 : 1.5;
            const lineId = `route-${routeSeq++}`;
            const popupState = r.active
              ? { html: `<b>Ruta Activa (Directa):</b> ${fromInfo.name} &rarr; ${toInfo.name}<br/><b>Flujo:</b> ${r.units} unidades` }
              : undefined;
            addRouteLine(lineId, fromInfo.coords, toInfo.coords, color, weight, r.active ? 0.9 : 0.4, !r.active, popupState);

            // Fetch real driving route from Mapbox Directions asynchronously
            fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${fromInfo.coords[1]},${fromInfo.coords[0]};${toInfo.coords[1]},${toInfo.coords[0]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`)
              .then(res => res.json())
              .then(data => {
                if (!isMapMounted) return;
                if (data.code === "Ok" && data.routes && data.routes[0]) {
                  updateRouteLine(lineId, data.routes[0].geometry.coordinates);
                  const distanceKm = data.routes[0].distance / 1000;
                  onRouteDistanceRef.current?.(`${r.from}|${r.to}`, distanceKm);
                  if (popupState) {
                    popupState.html = `<b>Ruta Activa (Vial):</b> ${fromInfo.name} &rarr; ${toInfo.name}<br/><b>Flujo:</b> ${r.units} unidades<br/><b>Distancia:</b> ${distanceKm.toFixed(1)} km`;
                  }
                }
              })
              .catch(err => {
                console.warn("Mapbox Directions falló, se mantiene la línea recta:", err);
              });
          });
        });
      } else {
        // Overview mode
        HUBS.forEach(hub => {
          const info = getKnownCityInfo(hub.id);
          if (info) {
            addMarker(info.coords, dark ? "#0EA5E9" : "#1345A8", 10, `<b>Hub:</b> ${info.name}`);
          }
        });

        ROUTES.forEach(r => {
          const fromInfo = getKnownCityInfo(r.from);
          const toInfo = getKnownCityInfo(r.to);
          if (!fromInfo || !toInfo) return;

          const color = r.active ? (dark ? "#0EA5E9" : "#1345A8") : (dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)");
          const lineId = `overview-route-${routeSeq++}`;
          addRouteLine(lineId, fromInfo.coords, toInfo.coords, color, r.active ? 2 : 1, r.active ? 0.8 : 0.4, !r.active);

          // Fetch real driving route from Mapbox Directions asynchronously
          fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${fromInfo.coords[1]},${fromInfo.coords[0]};${toInfo.coords[1]},${toInfo.coords[0]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`)
            .then(res => res.json())
            .then(data => {
              if (!isMapMounted) return;
              if (data.code === "Ok" && data.routes && data.routes[0]) {
                updateRouteLine(lineId, data.routes[0].geometry.coordinates);
              }
            })
            .catch(err => {
              console.warn("Mapbox Directions falló, se mantiene la línea recta:", err);
            });
        });
      }
    });

    return () => {
      isMapMounted = false;
      resizeObserver.disconnect();
      markers.forEach(m => m.remove());
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

const AUDIT_TYPE_LABELS: Record<string, string> = {
  solver_lp: "Resolución: Programación Lineal",
  solver_transport: "Resolución: Transporte",
  solver_networks: "Resolución: Redes",
  solver_dynamic: "Resolución: Programación Dinámica",
  solver_inventories: "Resolución: Inventarios",
  groq_tutor: "IA: explicación de resultados",
  groq_tutor_interpret: "IA: interpretación de enunciado",
  groq_tutor_validate: "IA: validación independiente",
  groq_tutor_socratic: "IA: guía socrática",
};

function OverviewView({ dark, dbModels }: { dark: boolean; dbModels: any[] }) {
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/audit/logs`)
      .then(r => r.json())
      .then(d => { if (d.status === "success" && Array.isArray(d.data)) setRecentLogs(d.data.slice(-8).reverse()); })
      .catch(() => {});
  }, []);

  // "Módulos resueltos" es sobre los 6 capítulos de IO, no sobre el total de
  // ejercicios en el historial (dbModels ya puede tener varios por módulo).
  // Para cada capítulo se mira el ejercicio más reciente (dbModels viene
  // ordenado por fecha desde el backend).
  const moduleStatusCards = MODULES.filter(m => m.id !== "overview").map(m => {
    const model = dbModels.find(dm => dm.type.toUpperCase() === MODULE_TO_DB_TYPE[m.id]);
    const solution = model?.solutions?.[0];
    return { ...m, hasSolution: !!solution, objectiveValue: solution?.objectiveValue, status: solution?.status };
  });
  const resolvedCount = moduleStatusCards.filter(m => m.hasSolution).length;
  const totalCount = moduleStatusCards.length;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row — derivado de los modelos reales, no simulado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="px-4 py-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Módulos Resueltos</p>
          <p className="text-xl font-semibold text-foreground leading-none">{resolvedCount} / {totalCount}</p>
          <p className="text-[11px] text-muted-foreground mt-2">de los 6 capítulos de IO</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Interacciones IA</p>
          <p className="text-xl font-semibold text-foreground leading-none">{recentLogs.length > 0 ? recentLogs.length : "—"}</p>
          <p className="text-[11px] text-muted-foreground mt-2">más recientes registradas</p>
        </Card>
        <Card className="px-4 py-3 col-span-2 md:col-span-2">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Estado del tutor</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-foreground">Resolutor + Validador activos</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Modo directo y modo socrático disponibles en el chat</p>
        </Card>
      </div>

      <Card>
        <SectionHeader title="Estado de los módulos" sub="Resumen de los 6 capítulos de Investigación Operativa" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
          {moduleStatusCards.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.id} className={`rounded-lg border p-3 ${m.hasSolution ? (dark ? "border-emerald-500/30 bg-emerald-500/5" : "border-emerald-700/20 bg-emerald-50") : "border-border bg-secondary/20"}`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-primary" />
                  <span className="text-xs font-medium text-foreground">{m.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {m.hasSolution ? `Resuelto · Z = ${typeof m.objectiveValue === "number" ? m.objectiveValue.toLocaleString() : "—"}` : "Sin resolver todavía"}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Mapa de Referencia" sub="Vista geográfica de apoyo para los módulos de Transporte y Redes" />
        <div className="p-4">
          <LogisticsMap dark={dark} defaultCenter={ECUADOR_DEFAULT_CENTER} defaultZoom={7} />
        </div>
      </Card>

      <Card>
        <SectionHeader title="Actividad Reciente" sub="Últimas interacciones registradas (resolver + IA)"
          actions={<Badge label={recentLogs.length > 0 ? "EN VIVO" : "SIN DATOS"} variant={recentLogs.length > 0 ? "success" : "default"} />}
        />
        <div className="divide-y divide-border">
          {recentLogs.length === 0 ? (
            <div className="px-5 py-6 text-xs text-muted-foreground text-center">
              Aún no hay actividad registrada. Resuelve un modelo o habla con el tutor para ver el historial aquí.
            </div>
          ) : recentLogs.map((log: any, i: number) => (
            <div key={log.id ?? i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-secondary/40 transition-colors">
              {log.type?.startsWith("groq") ? <Brain size={13} className="text-blue-500 mt-0.5 shrink-0" /> : <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />}
              <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-14">
                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </span>
              <span className="text-xs text-foreground">{AUDIT_TYPE_LABELS[log.type] ?? log.type}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function LPView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];
  const problem = modelData?.data;

  if (!activeSolution) {
    return (
      <Card>
        <EmptyState
          dark={dark}
          title="Este modelo aún no se ha resuelto"
          sub={'Ajusta los parámetros en "Editar Datos" y dale clic a "Resolver" (o pídeselo al Tutor por chat) para ver la solución óptima, el análisis de sensibilidad y el detalle paso a paso.'}
        />
      </Card>
    );
  }

  const displaySolution = Array.isArray(activeSolution.variables) ? activeSolution.variables.map((v: any) => ({
    variable: v.name,
    value: v.value,
    reducedCost: v.reduced_cost ?? v.reducedCost ?? 0.0,
    lower: v.lower ?? "—",
    upper: v.upper ?? "—"
  })) : [];

  const displayConstraints = Array.isArray(activeSolution.constraints) ? activeSolution.constraints.map((c: any) => {
    const original = problem?.constraints?.find((pc: any) => pc.name === c.name);
    return {
      name: c.name.replace(/_/g, ' '),
      slack: c.slack,
      shadowPrice: c.shadow_price ?? c.shadowPrice ?? 0.0,
      rhsLow: c.rhsLow ?? "—",
      rhsHigh: c.rhsHigh ?? "—",
      rhs: original?.rhs,
      coefficients: original?.coefficients,
      operator: original?.operator,
    };
  }) : [];

  const objVal = activeSolution.objectiveValue ?? 0;
  const objectiveTerms = problem?.variables ? Object.fromEntries(problem.variables.map((v: any) => [v.name, v.objCoef])) : undefined;

  const sensChartData = displayConstraints.filter(
    (c: any) => typeof c.rhsLow === "number" && typeof c.rhsHigh === "number" && typeof c.rhs === "number"
  ).map((c: any) => ({ constraint: c.name, current: c.rhs, lower: c.rhsLow, upper: c.rhsHigh }));

  return (
    <div className="flex flex-col gap-4">
      {problem?.variables && problem?.constraints && (
        <Card>
          <SectionHeader
            title="Formulación del problema"
            sub={`${problem.objective === "minimize" ? "Minimizar" : "Maximizar"} Z = ${formatLinearExpr(objectiveTerms)}`}
          />
          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {displayConstraints.map((c: any) => (
              <div key={c.name} className={`rounded-lg border p-3 ${c.slack === 0 ? (dark ? "border-blue-500/30 bg-blue-500/5" : "border-blue-700/20 bg-blue-50") : "border-border bg-secondary/30"}`}>
                <p className="text-[10px] font-mono text-muted-foreground">{c.name}</p>
                <p className="text-sm font-mono font-medium text-foreground mt-1">
                  {c.coefficients ? `${formatLinearExpr(c.coefficients)} ${c.operator} ${c.rhs}` : "—"}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground">Estado</span>
                  <span className={`text-[10px] font-mono font-semibold ${c.slack === 0 ? "text-amber-500" : "text-emerald-500"}`}>
                    {c.slack === 0 ? "Activa (sin holgura)" : `Holgura: ${c.slack.toFixed(2)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Solución óptima" sub={`${activeSolution.method_used ?? "Solver"} · Z* = ${objVal.toLocaleString()}`}
            actions={<Badge label={activeSolution.status === "Optimal" ? "ÓPTIMO" : activeSolution.status} variant={activeSolution.status === "Optimal" ? "success" : "warning"} />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Variable", "Valor", "Costo Reducido", "Cota Inf.", "Cota Sup."].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displaySolution.map((r: any) => (
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
          <SectionHeader title="Análisis de sensibilidad" sub="Precios sombra y rangos de RHS" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Restricción", "Holgura", "Precio Sombra", "RHS Mín.", "RHS Máx."].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayConstraints.map((r: any) => (
                  <tr key={r.name} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 text-foreground">{r.name}</td>
                    <td className={`px-5 py-3 font-mono ${r.slack === 0 ? "text-amber-500 font-semibold" : "text-emerald-600"}`}>{r.slack.toFixed(2)}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-primary">{r.shadowPrice.toFixed(3)}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground">{r.rhsLow}</td>
                    <td className="px-5 py-3 font-mono text-muted-foreground">{r.rhsHigh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sensChartData.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-mono text-muted-foreground mb-3 uppercase tracking-widest">Rango RHS — Actual vs. Factible</p>
              <ResponsiveContainer width="100%" height={Math.max(80, sensChartData.length * 40)}>
                <BarChart data={sensChartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="constraint" tick={{ fill: dark ? "#6B7280" : "#9CA3AF", fontSize: 10, fontFamily: "DM Mono" }} width={60} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip dark={dark} />} />
                  <Bar dataKey="lower" name="Mínimo" fill={dark ? "rgba(59,130,246,0.2)" : "rgba(19,69,168,0.1)"} radius={[2,0,0,2]} />
                  <Bar dataKey="current" name="Actual" fill={dark ? "#3B82F6" : "#1345A8"} radius={0} />
                  <Bar dataKey="upper" name="Máximo" fill={dark ? "rgba(14,165,233,0.3)" : "rgba(3,105,161,0.15)"} radius={[0,2,2,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {activeSolution?.steps ? (
        <AlgorithmSteps
          steps={activeSolution.steps}
          dark={dark}
          heading={activeSolution.method_used ? `Detalle paso a paso — ${activeSolution.method_used}` : "Detalle paso a paso"}
        />
      ) : activeSolution?.steps_note ? (
        <p className="text-xs font-mono text-muted-foreground px-1">{activeSolution.steps_note}</p>
      ) : null}
    </div>
  );
}

function TransportView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];
  const problem = modelData?.data;

  // Distancia vial real (Km) por ruta, reportada por LogisticsMap a medida que
  // Mapbox Directions va resolviendo cada tramo. Se indexa por "origen|destino".
  const [routeDistances, setRouteDistances] = useState<Record<string, number>>({});
  const handleRouteDistance = useCallback((key: string, distanceKm: number) => {
    setRouteDistances(prev => (prev[key] === distanceKm ? prev : { ...prev, [key]: distanceKm }));
  }, []);

  const maxUnits = activeSolution && Array.isArray(activeSolution.variables)
    ? Math.max(...activeSolution.variables.map((v: any) => v.units), 1) : 1;

  const displayPlan = activeSolution && Array.isArray(activeSolution.variables) ? activeSolution.variables.map((v: any) => ({
    origin: v.origin,
    destination: v.destination,
    route: `${v.origin.replace(/_/g, ' ')} → ${v.destination.replace(/_/g, ' ')}`,
    units: v.units,
    cost: v.cost,
    pct: Math.round((v.units / maxUnits) * 100),
    status: "Óptimo"
  })) : [];

  const totalCost = activeSolution?.objectiveValue ?? 0;

  // Memoizado: si no, cada render de TransportView (ej. al llegar una nueva
  // distancia por onRouteDistance) crearía un array nuevo y el useEffect de
  // LogisticsMap, que depende de la identidad de `routes`, reiniciaría el
  // mapa entero en bucle antes de que las distancias llegaran a asentarse.
  const mapRoutes = useMemo(() => (
    activeSolution && Array.isArray(activeSolution.variables) ? activeSolution.variables.map((v: any) => ({
      from: v.origin,
      to: v.destination,
      units: v.units,
      active: v.units > 0
    })) : []
  ), [activeSolution]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHeader title="Mapa Real de Rutas de Transporte" sub="Orígenes y destinos óptimos calculados visualizados en mapa real" />
        <div className="p-4">
          <LogisticsMap dark={dark} routes={mapRoutes} defaultCenter={ECUADOR_DEFAULT_CENTER} defaultZoom={7} onRouteDistance={handleRouteDistance} />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {problem?.origins && problem?.destinations && problem?.costs ? (
          <Card>
            <SectionHeader title="Tabla de costos ($/unidad)" sub={`Balanceado: ${(problem.supply?.reduce((a: number, b: number) => a + b, 0) === problem.demand?.reduce((a: number, b: number) => a + b, 0)) ? "sí" : "no"}`} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground">Origen \ Destino</th>
                    {problem.destinations.map((d: string) => (
                      <th key={d} className="text-center px-3 py-2.5 text-[10px] font-mono text-muted-foreground">{d}</th>
                    ))}
                    <th className="text-center px-3 py-2.5 text-[10px] font-mono text-muted-foreground">Oferta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {problem.origins.map((o: string, i: number) => (
                    <tr key={o} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-foreground text-[11px]">{o}</td>
                      {problem.costs[i]?.map((v: number, j: number) => (
                        <td key={j} className="text-center px-3 py-3 font-mono font-semibold text-[11px] text-foreground">${v}</td>
                      ))}
                      <td className="text-center px-3 py-3 font-mono font-bold text-[11px] text-primary">{problem.supply?.[i] ?? "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-secondary/20">
                    <td className="px-5 py-3 font-mono text-foreground text-[11px]">Demanda</td>
                    {problem.demand?.map((v: number, j: number) => (
                      <td key={j} className="text-center px-3 py-3 font-mono font-bold text-[11px] text-primary">{v}</td>
                    ))}
                    <td className="px-3 py-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card><EmptyState dark={dark} title="Sin datos del problema" sub="Edita los orígenes, destinos, oferta, demanda y costos en el editor del módulo." /></Card>
        )}

        {activeSolution ? (
          <Card>
            <SectionHeader title="Plan de transporte óptimo" sub={`Costo total: ${totalCost.toLocaleString()} · ${displayPlan.length} rutas activas`}
              actions={<Badge label={activeSolution.status === "Optimal" ? "ÓPTIMO" : activeSolution.status} variant={activeSolution.status === "Optimal" ? "success" : "warning"} />}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Ruta", "Unidades", "Distancia", "Costo", "Utilización", "Estado"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayPlan.map((r: any) => {
                    const distanceKm = routeDistances[`${r.origin}|${r.destination}`];
                    return (
                    <tr key={r.route} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-[11px] text-foreground">{r.route}</td>
                      <td className="px-4 py-3 font-mono text-foreground">{r.units}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{distanceKm != null ? `${distanceKm.toFixed(1)} km` : "—"}</td>
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
                        <Badge label={r.status} variant="success" />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card><EmptyState dark={dark} title="Aún no se ha resuelto" sub='Dale clic a "Resolver" para calcular el plan óptimo de transporte.' /></Card>
        )}
      </div>

      {activeSolution && (Array.isArray(activeSolution.supply_duals) || Array.isArray(activeSolution.opportunity_costs)) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <SectionHeader title="Precios sombra" sub="Costo marginal de tener 1 unidad más de oferta o demanda" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Nodo", "Tipo", "Holgura", "Precio Sombra"].map(h => (
                      <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    ...(activeSolution.supply_duals ?? []).map((r: any) => ({ ...r, tipo: "Oferta" })),
                    ...(activeSolution.demand_duals ?? []).map((r: any) => ({ ...r, tipo: "Demanda" })),
                  ].map((r: any, i: number) => (
                    <tr key={`${r.tipo}-${r.name}-${i}`} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3 text-foreground">{r.name}</td>
                      <td className="px-5 py-3 font-mono text-muted-foreground">{r.tipo}</td>
                      <td className={`px-5 py-3 font-mono ${r.slack === 0 ? "text-amber-500 font-semibold" : "text-emerald-600"}`}>{r.slack.toFixed(2)}</td>
                      <td className="px-5 py-3 font-mono font-semibold text-primary">{r.shadow_price.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionHeader title="Rutas principales vs. alternativas" sub="Cuáles usar (ordenadas por volumen) y cuánto costaría forzar las demás" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Ruta", "Estado", "Unidades", "Distancia", "Costo de Oportunidad"].map(h => (
                      <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    ...(activeSolution.allocations ?? []).map((a: any) => ({ origin: a.origin, destination: a.destination, units: a.units, opportunity_cost: 0, recommended: true })),
                    ...(activeSolution.opportunity_costs ?? []).map((r: any) => ({ ...r, units: null, recommended: false })),
                  ]
                    .sort((a, b) => {
                      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
                      return a.recommended ? (b.units ?? 0) - (a.units ?? 0) : a.opportunity_cost - b.opportunity_cost;
                    })
                    .map((r: any, i: number) => {
                      const distanceKm = routeDistances[`${r.origin}|${r.destination}`];
                      return (
                      <tr key={`${r.origin}-${r.destination}-${i}`} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-[11px] text-foreground">{r.origin.replace(/_/g, ' ')} → {r.destination.replace(/_/g, ' ')}</td>
                        <td className="px-5 py-3">
                          <Badge label={r.recommended ? "PRINCIPAL" : "NO RECOMENDADA"} variant={r.recommended ? "success" : "default"} />
                        </td>
                        <td className="px-5 py-3 font-mono text-muted-foreground">{r.units != null ? r.units.toLocaleString() : "—"}</td>
                        <td className="px-5 py-3 font-mono text-muted-foreground">{distanceKm != null ? `${distanceKm.toFixed(1)} km` : "—"}</td>
                        <td className={`px-5 py-3 font-mono font-semibold ${r.recommended ? "text-emerald-600" : "text-amber-500"}`}>
                          {r.recommended ? "0,000" : `+${r.opportunity_cost.toFixed(3)}`}
                        </td>
                      </tr>
                      );
                    })}
                  {(activeSolution.allocations ?? []).length === 0 && (activeSolution.opportunity_costs ?? []).length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-4 text-center text-muted-foreground font-mono text-[11px]">Sin datos de rutas todavía.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {Array.isArray(activeSolution?.comparisons) && activeSolution.comparisons.length > 0 && (
        <Card>
          <SectionHeader
            title="Comparación de métodos de solución inicial"
            sub={`Se usó ${activeSolution.initial_method_used ?? '—'} como punto de partida para MODI`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Método", "Costo inicial"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeSolution.comparisons.map((c: any) => (
                  <tr key={c.method} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-foreground">{c.method}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-primary">${c.total_cost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeSolution?.steps ? (
        <AlgorithmSteps
          steps={activeSolution.steps}
          dark={dark}
          heading="Optimización MODI — de la solución inicial al óptimo"
        />
      ) : activeSolution?.steps_note ? (
        <p className="text-xs font-mono text-muted-foreground px-1">{activeSolution.steps_note}</p>
      ) : null}
    </div>
  );
}

function NetworksView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];
  const algorithm = activeSolution?.algorithm;
  const result = activeSolution?.result;

  if (!activeSolution || !result) {
    return (
      <Card>
        <EmptyState
          dark={dark}
          title="Aún no se ha resuelto"
          sub='Elige un algoritmo (ruta más corta, árbol de expansión mínima, flujo máximo o flujo de costo mínimo) en el editor y dale clic a "Resolver".'
        />
      </Card>
    );
  }

  let mapRoutes: { from: string; to: string; units: number; active: boolean }[] = [];
  if (algorithm === "shortest_path" && Array.isArray(result.path)) {
    mapRoutes = result.path.slice(0, -1).map((n: string, i: number) => ({ from: n, to: result.path[i + 1], units: 1, active: true }));
  } else if (algorithm === "min_spanning_tree" && Array.isArray(result.edges)) {
    mapRoutes = result.edges.map((e: any) => ({ from: e.source, to: e.target, units: e.weight, active: true }));
  } else if (result.flows) {
    mapRoutes = Object.entries(result.flows).flatMap(([src, targets]: [string, any]) =>
      Object.entries(targets).filter(([, f]) => (f as number) > 0).map(([tgt, f]) => ({ from: src, to: tgt, units: f as number, active: true }))
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHeader title="Mapa Real de la Red" sub="Visualización de nodos y arcos con el resultado calculado" />
        <div className="p-4">
          <LogisticsMap dark={dark} routes={mapRoutes} defaultCenter={ECUADOR_DEFAULT_CENTER} defaultZoom={7} />
        </div>
      </Card>

      <Card>
        {algorithm === "shortest_path" && Array.isArray(result.path) && (
          <>
            <SectionHeader title="Ruta más corta" sub={`Costo total: ${result.cost}`} actions={<Badge label="ÓPTIMO" variant="success" />} />
            <div className="p-5 flex items-center gap-2 flex-wrap">
              {result.path.map((n: string, i: number) => (
                <Fragment key={i}>
                  <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-mono text-xs font-semibold">{n}</span>
                  {i < result.path.length - 1 && <ChevronRight size={14} className="text-muted-foreground" />}
                </Fragment>
              ))}
            </div>
          </>
        )}

        {algorithm === "min_spanning_tree" && Array.isArray(result.edges) && (
          <>
            <SectionHeader title="Árbol de expansión mínima" sub={`Peso total: ${result.total_weight}`} actions={<Badge label="ÓPTIMO" variant="success" />} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Arco", "Peso"].map(h => <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.edges.map((e: any, i: number) => (
                    <tr key={i} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-foreground text-[11px]">{e.source} — {e.target}</td>
                      <td className="px-5 py-3 font-mono text-primary font-semibold">{e.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(algorithm === "max_flow" || algorithm === "min_cost_flow") && result.flows && (
          <>
            <SectionHeader
              title={algorithm === "max_flow" ? "Flujo máximo" : "Flujo de costo mínimo"}
              sub={algorithm === "max_flow" ? `Flujo total: ${result.total_flow}` : `Costo total: ${result.total_cost}`}
              actions={<Badge label="ÓPTIMO" variant="success" />}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Arco", "Flujo"].map(h => <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(result.flows).flatMap(([src, targets]: [string, any]) =>
                    Object.entries(targets).filter(([, f]) => (f as number) > 0).map(([tgt, f]) => (
                      <tr key={`${src}-${tgt}`} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-foreground text-[11px]">{src} → {tgt}</td>
                        <td className="px-5 py-3 font-mono text-primary font-semibold">{f as number}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {activeSolution?.steps ? (
        <AlgorithmSteps steps={activeSolution.steps} dark={dark} heading="Detalle paso a paso del algoritmo" />
      ) : activeSolution?.steps_note ? (
        <p className="text-xs font-mono text-muted-foreground px-1">{activeSolution.steps_note}</p>
      ) : null}
    </div>
  );
}

function DPView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];
  const problemType = modelData?.data?.problem_type;

  if (!activeSolution) {
    return (
      <Card>
        <EmptyState dark={dark} title="Aún no se ha resuelto" sub='Define los parámetros (mochila o lote económico) y dale clic a "Resolver".' />
      </Card>
    );
  }

  const optimalValue = activeSolution.objectiveValue ?? 0;
  const decisions = Array.isArray(activeSolution.decisions) ? activeSolution.decisions
    : Array.isArray(activeSolution.variables) ? activeSolution.variables : [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {problemType === "lot_sizing" ? (
          <>
            <SectionHeader title="Política óptima por período" sub={`Costo total: ${optimalValue.toLocaleString()}`} actions={<Badge label="ÓPTIMO" variant="success" />} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Período", "Cantidad a pedir", "Cubre períodos"].map(h => (
                      <th key={h} className="text-left px-5 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {decisions.map((d: any, i: number) => (
                    <tr key={i} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-primary font-medium">Período {d.period}</td>
                      <td className="px-5 py-3 font-mono text-foreground">{d.order_qty}</td>
                      <td className="px-5 py-3 text-foreground text-[11px]">{Array.isArray(d.covered_periods) ? d.covered_periods.join(", ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <SectionHeader title="Objetos seleccionados (mochila)" sub={`Valor óptimo: ${optimalValue.toLocaleString()}`} actions={<Badge label="ÓPTIMO" variant="success" />} />
            <div className="p-5 flex flex-wrap gap-2">
              {decisions.length > 0 ? decisions.map((idx: number, i: number) => (
                <span key={i} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-mono text-xs font-semibold">Objeto {idx + 1}</span>
              )) : <span className="text-xs text-muted-foreground">Ningún objeto seleccionado</span>}
            </div>
          </>
        )}
      </Card>

      {activeSolution?.steps ? (
        <AlgorithmSteps steps={activeSolution.steps} dark={dark} heading="Detalle paso a paso" />
      ) : activeSolution?.steps_note ? (
        <p className="text-xs font-mono text-muted-foreground px-1">{activeSolution.steps_note}</p>
      ) : null}
    </div>
  );
}

const INVENTORY_FIELD_LABELS: Record<string, string> = {
  eoq: "EOQ (cantidad óptima)",
  reorder_point: "Punto de reorden",
  safety_stock: "Stock de seguridad",
  total_cost: "Costo total",
  max_shortage: "Faltante máximo",
  max_inventory: "Inventario máximo",
  run_time_days: "Días de producción",
  cycle_time_days: "Días de ciclo",
};

function InventoriesView({ dark, modelData }: { dark: boolean; modelData?: any }) {
  const activeSolution = modelData?.solutions?.[0];
  const calcType = modelData?.data?.calc_type;
  const result = activeSolution?.result;

  if (!activeSolution || !result) {
    return (
      <Card>
        <EmptyState dark={dark} title="Aún no se ha resuelto" sub='Elige un modelo (EOQ, descuentos por cantidad, faltantes, EPQ, punto de reorden o ABC) y dale clic a "Resolver".' />
      </Card>
    );
  }

  const stepsBlock = activeSolution?.steps ? (
    <AlgorithmSteps steps={activeSolution.steps} dark={dark} heading="Sustitución en la fórmula, paso a paso" />
  ) : activeSolution?.steps_note ? (
    <p className="text-xs font-mono text-muted-foreground px-1">{activeSolution.steps_note}</p>
  ) : null;

  if (calcType === "abc" && Array.isArray(result.classification)) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <SectionHeader title="Clasificación ABC" sub={`${result.classification.length} SKUs`} actions={<Badge label="ÓPTIMO" variant="success" />} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["SKU", "Valor anual", "% del total", "% acumulado", "Clase"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.classification.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-primary text-[11px]">{r.sku}</td>
                    <td className="px-4 py-3 font-mono text-foreground">{r.annual_value.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{r.percentage.toFixed(1)}%</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{r.cum_percentage.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-bold text-sm ${r.abc_class === "A" ? "text-primary" : r.abc_class === "B" ? (dark ? "text-sky-400" : "text-sky-700") : "text-muted-foreground"}`}>{r.abc_class}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {stepsBlock}
      </div>
    );
  }

  if (calcType === "eoq_discounts" && Array.isArray(result.candidates)) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <SectionHeader
            title="EOQ con descuentos por cantidad"
            sub={result.best_option ? `Mejor opción: ${result.best_option.order_qty} unidades @ $${result.best_option.unit_price}` : ""}
            actions={<Badge label="ÓPTIMO" variant="success" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Precio unitario", "Cantidad a pedir", "Costo total"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.candidates.map((c: any, i: number) => {
                  const isBest = result.best_option && c.unit_price === result.best_option.unit_price;
                  return (
                    <tr key={i} className={`hover:bg-secondary/30 transition-colors ${isBest ? (dark ? "bg-blue-500/5" : "bg-blue-50") : ""}`}>
                      <td className="px-4 py-3 font-mono text-foreground">${c.unit_price}</td>
                      <td className="px-4 py-3 font-mono text-foreground">{c.order_qty}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-primary flex items-center gap-2">
                        ${c.total_cost.toLocaleString()} {isBest && <Badge label="MEJOR" variant="success" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        {stepsBlock}
      </div>
    );
  }

  const numericFields = Object.entries(result).filter(([k, v]) => typeof v === "number" && INVENTORY_FIELD_LABELS[k]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHeader title="Resultado del modelo de inventario" sub={calcType ?? ""} actions={<Badge label="ÓPTIMO" variant="success" />} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
          {numericFields.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-3 bg-secondary/20">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{INVENTORY_FIELD_LABELS[k]}</p>
              <p className="text-xl font-semibold text-foreground mt-1">{(v as number).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
          ))}
        </div>
      </Card>
      {stepsBlock}
    </div>
  );
}

// ─── AI Tutor ─────────────────────────────────────────────────────────────────

const MODULE_INTROS: Record<ModuleId, string> = {
  overview:    "Bienvenido al Centro de Control. Como tu Consultor Ejecutivo, estoy listo para interpretar los KPIs y diagnosticar anomalías en tu cadena de suministro.",
  lp:          "Módulo de Optimización Lineal. ¿Deseas que analice los resultados de la función objetivo o que evaluemos los ahorros marginales de tus recursos?",
  transport:   "Módulo de Transporte. Estoy listo para evaluar el costo total de distribución y recomendar ajustes en tus rutas óptimas.",
  networks:    "Módulo de Redes. ¿Quieres que analicemos los flujos de costo mínimo o identifiquemos los cuellos de botella en la red?",
  ip:          "Módulo de Programación Entera. ¿Procedemos a evaluar las decisiones estratégicas de la solución exacta?",
  dp:          "Módulo de Programación Dinámica. ¿Revisamos la política óptima y los costos acumulados por período?",
  inventories: "Módulo de Inventarios. ¿Te gustaría analizar los parámetros de pedido óptimos y costos de almacenamiento?",
};

type ChatMessage = { role: "user" | "assistant"; text: string };
const CHAT_HISTORY_STORAGE_KEY = "tl_chat_history_v1";

function loadStoredChatHistories(): Partial<Record<ModuleId, ChatMessage[]>> {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const DB_TYPE_LABELS: Record<string, string> = {
  LP: "Programación Lineal / Entera",
  TRANSPORT: "Transporte",
  NETWORKS: "Redes",
  DYNAMIC: "Programación Dinámica",
  INVENTORIES: "Inventarios",
};

// Cada ejercicio resuelto (por chat o con "Resolver") queda como una entrada
// propia del historial — nunca se sobreescribe uno anterior. Este panel deja
// elegir, ejercicio por ejercicio, ver/descargar su propio Anexo de
// Interacción con IA (PDF/CSV), incluyendo los que solo se exploraron en modo
// socrático y nunca llegaron a resolverse numéricamente.
function HistorialPanel({ dark, dbModels, onClose }: { dark: boolean; dbModels: any[]; onClose: () => void }) {
  const bg = dark ? "#1C1F26" : "#FFFFFF";
  const border = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const textFg = dark ? "#E2E8F0" : "#0D1B2A";
  const textMuted = dark ? "#6B7280" : "#9CA3AF";
  const accent = dark ? "#3B82F6" : "#1345A8";

  const sorted = [...dbModels].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="w-full max-w-2xl rounded-xl overflow-hidden flex flex-col"
          style={{
            background: bg,
            border: `1px solid ${border}`,
            maxHeight: "80vh",
            boxShadow: dark ? "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)" : "0 20px 60px rgba(0,0,0,0.15)"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 flex items-center gap-2.5 border-b shrink-0" style={{ borderColor: border }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: accent }}>
              <Clock size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: textFg }}>Historial de Ejercicios</p>
              <p className="text-[11px] font-mono" style={{ color: textMuted }}>
                {sorted.length} ejercicio{sorted.length !== 1 ? "s" : ""} — elige uno para ver su Anexo IA
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              style={{ color: textMuted }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {sorted.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-mono" style={{ color: textMuted }}>Todavía no hay ejercicios registrados.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: border }}>
                {sorted.map((m: any) => {
                  const solved = Array.isArray(m.solutions) && m.solutions.length > 0;
                  const objectiveValue = solved ? m.solutions[0]?.objectiveValue : null;
                  return (
                    <div key={m.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-secondary/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold" style={{ color: textFg }}>{DB_TYPE_LABELS[m.type] || m.type}</p>
                          <Badge label={solved ? "RESUELTO" : "SOLO EXPLORADO"} variant={solved ? "success" : "default"} />
                        </div>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color: textMuted }}>
                          {new Date(m.createdAt).toLocaleString('es-EC')}
                          {objectiveValue != null ? ` · Z = ${Number(objectiveValue).toLocaleString()}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`${API_BASE_URL}/api/audit/annex?modelId=${m.id}&format=pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Descargar Anexo IA de este ejercicio (PDF)"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-mono transition-colors"
                          style={{ background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: textMuted, border: `1px solid ${border}` }}
                        >
                          <Download size={11} /> PDF
                        </a>
                        <a
                          href={`${API_BASE_URL}/api/audit/annex?modelId=${m.id}&format=csv`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Descargar Anexo IA de este ejercicio (CSV)"
                          className="px-2.5 py-1.5 rounded text-[10px] font-mono transition-colors"
                          style={{ background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: textMuted, border: `1px solid ${border}` }}
                        >
                          CSV
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function AiTutor({ dark, activeModule, activeModelData, onModelInterpreted }: { dark: boolean; activeModule: ModuleId; activeModelData?: any; onModelInterpreted: (moduleType: ModuleId, data: any, exerciseId: string, solve?: boolean) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  // Historial persistido por módulo (localStorage), para no perder la conversación al cambiar
  // de módulo o recargar la página.
  const [allHistories, setAllHistories] = useState<Partial<Record<ModuleId, ChatMessage[]>>>(loadStoredChatHistories);
  const messages = allHistories[activeModule] ?? [];
  const setMessages = (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setAllHistories(prev => {
      const current = prev[activeModule] ?? [];
      const next = typeof updater === "function" ? (updater as (p: ChatMessage[]) => ChatMessage[])(current) : updater;
      return { ...prev, [activeModule]: next };
    });
  };
  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(allHistories));
  }, [allHistories]);

  // Ejercicio (OptimizationModel) al que se están etiquetando las interacciones
  // de IA de la conversación actual de cada módulo — así el Anexo IA se puede
  // filtrar por ejercicio individual desde "Historial". Solo vive en memoria:
  // no hace falta persistirlo, cada ejercicio ya queda guardado en la base.
  const [activeExerciseIds, setActiveExerciseIds] = useState<Partial<Record<ModuleId, string>>>({});
  const activeExerciseId = activeExerciseIds[activeModule];
  const setActiveExerciseId = (id: string) => setActiveExerciseIds(prev => ({ ...prev, [activeModule]: id }));

  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [socraticMode, setSocraticMode] = useState(false);
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
      const response = await fetch(`${API_BASE_URL}/api/tutor/upload`, {
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
      if (!allHistories[activeModule] || allHistories[activeModule]!.length === 0) {
        setMessages([{ role: "assistant", text: MODULE_INTROS[activeModule] }]);
      }
      prevModule.current = activeModule;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const MODULE_TYPE_LABELS: Record<string, string> = {
    lp: "Programación Lineal", ip: "Programación Entera", transport: "Transporte",
    networks: "Redes", dp: "Programación Dinámica", inventories: "Inventarios",
  };

  const askAboutActiveModel = async (text: string, historyBeforeThis: { role: "user" | "assistant"; text: string }[], modelId?: string) => {
    const solution = activeModelData?.solutions?.[0] || {};
    const problemContext = `Active Module: ${activeModule}. Model configuration: ${JSON.stringify(activeModelData?.data || {})}`;

    const response = await fetch(`${API_BASE_URL}/api/tutor/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemContext,
        mathematicalSolution: solution,
        userMessage: text,
        modelId,
        chatHistory: historyBeforeThis.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          text: m.text
        }))
      })
    });
    return response.json();
  };

  // Un solo botón que hace todo: interpreta el mensaje y, si es un problema nuevo, lo guarda
  // como un ejercicio propio del historial (nunca sobreescribe uno anterior). En modo directo
  // lo resuelve de una vez y narra el resultado; en modo socrático lo guarda SIN resolver y
  // sigue con preguntas orientadoras — la interpretación es silenciosa, nunca revela la solución.
  // Las preguntas de seguimiento sobre un modelo ya activo responden como el tutor de siempre.
  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const historyBeforeThis = messages;
    setMessages(m => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);

    try {
      // Id provisional para el caso de que este mensaje resulte ser un problema
      // nuevo — así la interpretación queda etiquetada con el mismo id que
      // tendrá el ejercicio en la base de datos, desde el primer mensaje.
      const provisionalId = crypto.randomUUID();

      // Si ya hay un modelo cargado en este módulo, se lo pasamos al Resolutor como
      // contexto: así puede detectar ediciones incrementales ("agrega también este
      // origen por $80") y devolver el mismo modelo con el cambio aplicado, en vez
      // de interpretar cada mensaje como un problema nuevo desde cero.
      const currentModel = activeModelData?.data
        ? { moduleType: activeModule, data: activeModelData.data }
        : undefined;

      const interpretRes = await fetch(`${API_BASE_URL}/api/tutor/interpret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text, currentModel, modelId: activeExerciseId || provisionalId })
      });
      const interpretData = await interpretRes.json();
      const isNewProblem = interpretData.status === "success" && interpretData.isNewProblem && interpretData.moduleType && interpretData.data;

      if (isNewProblem) {
        const label = MODULE_TYPE_LABELS[interpretData.moduleType] ?? interpretData.moduleType;
        setActiveExerciseId(provisionalId);

        if (socraticMode) {
          // Guarda el ejercicio (para que aparezca en Historial) SIN resolverlo:
          // el modo socrático nunca revela la solución directamente.
          const savedModel = await onModelInterpreted(interpretData.moduleType as ModuleId, interpretData.data, provisionalId, false);
          setTyping(false);
          setMessages(m => [...m, {
            role: "assistant",
            text: savedModel
              ? `📥 Detecté un problema de **${label}**. ${interpretData.explanation ?? ""}\n\nVamos a explorarlo con preguntas — no te voy a dar la solución directamente.`
              : `📥 Detecté un problema de **${label}**, pero no pude guardarlo (¿existe ese módulo en la base de datos?).`
          }]);
          // Sigue más abajo con la primera pregunta orientadora del modo socrático.
        } else {
          const solvedModel = await onModelInterpreted(interpretData.moduleType as ModuleId, interpretData.data, provisionalId, true);

          if (!solvedModel) {
            setTyping(false);
            setMessages(m => [...m, {
              role: "assistant",
              text: `📥 Detecté un problema de **${label}**, pero no pude resolverlo automáticamente (¿existe ese módulo en la base de datos?). Revisa el editor.`
            }]);
            return;
          }

          const askData = await askAboutActiveModel(text, historyBeforeThis, provisionalId);
          setTyping(false);

          const intro = `📥 **${label}** — ${interpretData.explanation ?? ""}\n\n`;
          const narration = askData.status === "success" && askData.reply
            ? askData.reply
            : "Ya resolví el modelo; revisa los resultados y el detalle paso a paso en el panel.";
          setMessages(m => [...m, { role: "assistant", text: intro + narration }]);

          // LLM #2: validador independiente, revisa el trabajo del LLM #1 antes de darlo por bueno.
          setTyping(true);
          try {
            const validateRes = await fetch(`${API_BASE_URL}/api/tutor/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                originalMessage: text,
                moduleType: interpretData.moduleType,
                data: interpretData.data,
                solvedSolution: solvedModel.solutions?.[0] || {},
                modelId: provisionalId
              })
            });
            const validateData = await validateRes.json();
            setTyping(false);

            if (validateData.status === "success") {
              const verdictEmoji: Record<string, string> = { valido: "✅", con_observaciones: "⚠️", invalido: "❌" };
              const emoji = verdictEmoji[validateData.verdict] ?? "🔍";
              const checksText = (validateData.checks_realizados as string[] || []).map((c: string) => `• ${c}`).join("\n");
              const issuesText = (validateData.issues as string[] || []).length > 0
                ? `\n\nProblemas encontrados:\n${(validateData.issues as string[]).map((i: string) => `• ${i}`).join("\n")}`
                : "";
              setMessages(m => [...m, {
                role: "assistant",
                text: `${emoji} Validación independiente: ${validateData.summary}\n\n${checksText}${issuesText}`
              }]);
            }
          } catch {
            setTyping(false);
          }
          return;
        }
      }

      if (socraticMode) {
        // Ya sea la primera pregunta tras detectar un problema nuevo, o una
        // respuesta de seguimiento dentro de la misma exploración socrática.
        try {
          const response = await fetch(`${API_BASE_URL}/api/tutor/socratic`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              activeModule,
              userMessage: text,
              modelId: isNewProblem ? provisionalId : activeExerciseId,
              chatHistory: historyBeforeThis.map(m => ({ role: m.role === "assistant" ? "model" : "user", text: m.text }))
            })
          });
          const resData = await response.json();
          setTyping(false);
          setMessages(m => [...m, { role: "assistant", text: resData.status === "success" ? resData.reply : "No pude generar una pregunta orientadora en este momento." }]);
        } catch (error) {
          setTyping(false);
          setMessages(m => [...m, { role: "assistant", text: "Error de conexión con el Tutor Socrático." }]);
        }
        return;
      }

      // No es un problema nuevo (o la interpretación falló): responder como tutor sobre el modelo activo.
      const askData = await askAboutActiveModel(text, historyBeforeThis, activeExerciseId);
      setTyping(false);
      if (askData.status === "success" && askData.reply) {
        setMessages(m => [...m, { role: "assistant", text: askData.reply }]);
      } else {
        setMessages(m => [...m, { role: "assistant", text: "No pude procesar tu mensaje. ¿Puedes reformularlo?" }]);
      }
    } catch (error) {
      setTyping(false);
      setMessages(m => [...m, { role: "assistant", text: "Error de conexión con el Tutor. Asegúrate de que el backend está corriendo." }]);
    }
  };

  const bg = dark ? "#1C1F26" : "#FFFFFF";
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
      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
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
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  if (window.confirm("¿Estás seguro de que quieres limpiar el historial de chat de este módulo?")) {
                    setMessages([{ role: "assistant", text: MODULE_INTROS[activeModule] }]);
                  }
                }}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors flex items-center justify-center"
                title="Limpiar historial de chat"
                style={{ color: dark ? "#94A3B8" : "#64748B" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Modo socrático */}
          <button
            onClick={() => setSocraticMode(v => !v)}
            title={socraticMode ? "Modo socrático activo: te haré preguntas, no resolveré directo" : "Modo directo: resuelvo y te explico el resultado"}
            className="px-4 py-2 flex items-center justify-between border-b transition-colors"
            style={{ borderColor: border, background: socraticMode ? (dark ? "rgba(245,158,11,0.08)" : "rgba(180,83,9,0.06)") : "transparent" }}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: socraticMode ? (dark ? "#F59E0B" : "#B45309") : (dark ? "#6B7280" : "#9CA3AF") }}>
              🎓 Modo socrático {socraticMode ? "activo" : "inactivo"}
            </span>
            <div
              className="w-8 h-4 rounded-full flex items-center px-0.5 transition-colors"
              style={{ background: socraticMode ? (dark ? "#F59E0B" : "#B45309") : (dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)") }}
            >
              <div
                className="w-3 h-3 rounded-full bg-white transition-transform"
                style={{ transform: socraticMode ? "translateX(16px)" : "translateX(0)" }}
              />
            </div>
          </button>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollbarWidth: "none" }}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "assistant" && (
                  <span className="text-[9px] font-mono mb-1" style={{ color: dark ? "#6B7280" : "#9CA3AF" }}>AI TUTOR</span>
                )}
                <div
                  className="max-w-[92%] text-xs leading-relaxed px-3 py-2 rounded-lg whitespace-pre-wrap"
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
              </motion.div>
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
              <button
                onClick={send}
                disabled={uploadingPdf || typing}
                title="Enviar: si es un problema nuevo lo resuelve y te lo explica; si es una pregunta, te responde sobre el modelo activo"
                className="shrink-0 transition-opacity hover:opacity-70 disabled:opacity-30"
              >
                <Send size={12} style={{ color: accent }} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
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
  const bg = dark ? "#191B21" : "#FFFFFF";
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
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg mb-0.5 text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
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
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("tl_dark_mode");
    return saved === null ? false : saved === "true";
  });
  const [historialOpen, setHistorialOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("tl_dark_mode", String(dark));
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  // El módulo activo vive en la URL (/lp, /transport, ...) en vez de en un useState local,
  // así se puede compartir un enlace directo, usar atrás/adelante del navegador, y recargar
  // sin perder el módulo en el que se estaba.
  const { moduleId } = useParams<{ moduleId?: string }>();
  const navigate = useNavigate();
  const activeModule: ModuleId = (MODULES.some(m => m.id === moduleId) ? moduleId : "overview") as ModuleId;
  const setActiveModule = (id: ModuleId) => navigate(id === "overview" ? "/" : `/${id}`);
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
      const res = await fetch(`${API_BASE_URL}/api/models`);
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

  const activeModelData = dbModels.find(m => m.type.toUpperCase() === MODULE_TO_DB_TYPE[activeModule]);

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

  // Guarda los parámetros editados a mano como un ejercicio NUEVO del historial
  // (no sobreescribe el que se estaba editando) y lo resuelve.
  const handleSaveAndSolve = async () => {
    if (jsonError || !activeModelData) return;
    setSolving(true);
    try {
      const parsedData = JSON.parse(jsonText);
      const response = await fetch(`${API_BASE_URL}/api/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), type: activeModelData.type, data: parsedData, solve: true })
      });
      const result = await response.json();
      if (result.status === "success" && result.data) {
        setDbModels(prev => [result.data, ...prev]);
        setEditing(false);
        alert("¡Parámetros guardados como ejercicio nuevo y resuelto con éxito!");
      } else {
        alert(`Error al guardar y resolver: ${result.message}`);
      }
    } catch (err) {
      alert("Error de conexión al guardar los datos.");
    } finally {
      setSolving(false);
    }
  };

  // Vuelve a resolver el modelo activo con los mismos parámetros, guardando el
  // resultado como un ejercicio NUEVO del historial (cada resolución queda
  // registrada por separado, no se pierde la anterior).
  const handleRunSolver = async () => {
    if (activeModule === "overview") return;
    const model = dbModels.find(m => m.type.toUpperCase() === MODULE_TO_DB_TYPE[activeModule]);
    if (!model) {
      alert("No se encontró configuración para este modelo en la base de datos.");
      return;
    }

    setSolving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), type: model.type, data: model.data, solve: true })
      });
      const result = await response.json();
      if (result.status === "success" && result.data) {
        setDbModels(prev => [result.data, ...prev]);
        alert(`¡Modelo ${model.type} resuelto con éxito! Nuevo ejercicio guardado en el historial.`);
      } else {
        alert(`Error al resolver el modelo: ${result.message}`);
      }
    } catch (err) {
      alert("Error de conexión al resolver el modelo.");
    } finally {
      setSolving(false);
    }
  };

  // Llamado por el chat del tutor cuando detecta un enunciado nuevo: cambia de módulo,
  // crea el ejercicio como una entrada NUEVA del historial (nunca sobreescribe uno
  // anterior del mismo módulo) usando el id que el chat generó para poder etiquetar
  // sus propias interacciones de IA con el mismo id desde el primer mensaje.
  // Si `solve` es false (modo socrático), el ejercicio se guarda sin resolver.
  const handleModelInterpreted = async (moduleType: ModuleId, data: any, exerciseId: string, solve: boolean = true): Promise<any> => {
    setActiveModule(moduleType);
    setJsonText(JSON.stringify(data, null, 2));
    setJsonError(null);
    if (solve) setSolving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: exerciseId, type: MODULE_TO_DB_TYPE[moduleType], data, solve })
      });
      const result = await response.json();
      if (result.status === "success" && result.data) {
        setDbModels(prev => [result.data, ...prev]);
        return result.data;
      }
      return null;
    } catch (err) {
      return null;
    } finally {
      if (solve) setSolving(false);
    }
  };

  const bg = dark ? "#14161B" : "#F4F7F6";
  const topbarBg = dark ? "rgba(25,27,33,0.95)" : "rgba(255,255,255,0.96)";
  const borderColor = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const textFg = dark ? "#E2E8F0" : "#0D1B2A";
  const textMuted = dark ? "#6B7280" : "#9CA3AF";
  const accentBlue = dark ? "#3B82F6" : "#1345A8";
  const currentModule = MODULES.find(m => m.id === activeModule)!;

  const moduleView = {
    overview:    <OverviewView dark={dark} dbModels={dbModels} />,
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

            {/* Historial de ejercicios: cada resolución (chat o "Resolver") queda como una
                entrada propia; desde acá se elige cuál ver/descargar como Anexo IA. */}
            <button
              onClick={() => setHistorialOpen(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors"
              title="Ver el historial de ejercicios resueltos y descargar el Anexo IA de cada uno"
              style={{ background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${borderColor}`, color: textMuted }}
            >
              <Clock size={13} />
              <span>Historial</span>
            </button>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors"
              style={{ background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${borderColor}`, color: textMuted }}
            >
              {dark ? <Sun size={13} /> : <Moon size={13} />}
              <span>{dark ? "Claro" : "Oscuro"}</span>
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
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {moduleView}
              </motion.div>
            </AnimatePresence>
            <div className="h-20" />
          </main>
        </div>
      </div>

      {/* AI Tutor */}
      <AiTutor dark={dark} activeModule={activeModule} activeModelData={activeModelData} onModelInterpreted={handleModelInterpreted} />

      {historialOpen && <HistorialPanel dark={dark} dbModels={dbModels} onClose={() => setHistorialOpen(false)} />}

      <style>{`
        * { scrollbar-width: none; }
        *::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
