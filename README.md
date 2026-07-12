# Tech Logistics IO

Plataforma web de **Investigación Operativa** orientada a la logística, con un **Tutor Socrático de IA (arquitectura multi-LLM)** y resolución **paso a paso** de modelos matemáticos de optimización.

Desarrollada como Trabajo Final de Semestre de la asignatura de Investigación Operativa: cubre los 6 capítulos obligatorios (Programación Lineal, Transporte, Redes, Programación Lineal Entera, Programación Dinámica Determinística e Inventarios Determinísticos) y funciona como una aplicación **reutilizable** — cualquier problema nuevo puede ingresarse en lenguaje natural por el chat.

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [El Tutor de IA (multi-LLM)](#el-tutor-de-ia-multi-llm)
- [Módulos y algoritmos](#módulos-y-algoritmos)
- [Cómo se usa](#cómo-se-usa)
- [Problemas de ejemplo](#problemas-de-ejemplo)
- [API del backend](#api-del-backend)
- [Tecnologías](#tecnologías)
- [Requisitos previos](#requisitos-previos)
- [Variables de entorno](#variables-de-entorno)
- [Levantar el proyecto](#levantar-el-proyecto)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Documentación adicional](#documentación-adicional)
- [Ramas principales](#ramas-principales)

---

## Arquitectura

El sistema está compuesto por **tres servicios** orquestados con Docker Compose, más dos bases de datos:

```
┌──────────────────────────────────────────────────────────┐
│                        Frontend                          │
│        React + Vite + Tailwind  (puerto 5173)            │
│   · Rutas por módulo (/lp, /transport, /networks, …)     │
│   · Chat del Tutor IA  · Vistas paso a paso              │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────────┐
│                        Backend                           │
│           Node.js + Express + TS (puerto 4000)           │
│   · Orquestación multi-LLM (Groq)  · RAG con PDFs        │
│   · Validación Zod  · Persistencia (Prisma/PostgreSQL)   │
│   · Auditoría de interacciones (archivo + MongoDB)       │
│   · Anexo de Interacción con IA (JSON / CSV / PDF)       │
└──────────────┬───────────────────────────────────────────┘
               │ HTTP
┌──────────────▼───────────────────────────────────────────┐
│                     Solver Service                       │
│           Python + FastAPI  (puerto 8000)                │
│   Motor matemático con implementaciones propias:         │
│   · Simplex / Dos Fases / Gran M   · MODI + heurísticas  │
│   · Dijkstra / Kruskal / Edmonds-Karp                    │
│   · DP (mochila, Wagner-Whitin)    · EOQ y variantes     │
│   Todos devuelven steps[] (iteraciones del algoritmo)    │
└──────────────────────────────────────────────────────────┘
```

**Principio de diseño**: los LLMs nunca hacen aritmética. Solo interpretan enunciados y explican resultados; todo cálculo lo ejecuta el Solver Service en Python, y cada algoritmo registra sus iteraciones intermedias en un esquema común de pasos (`SolutionStep`) que la interfaz muestra en un panel expandible.

---

## El Tutor de IA (multi-LLM)

El flujo completo cuando el estudiante escribe un problema en el chat:

| # | Rol | Qué hace |
|---|---|---|
| 1 | **Resolutor (LLM #1)** | Clasifica el enunciado en uno de los 6 módulos y construye el JSON de parámetros exacto (modo JSON estricto de Groq). Distingue problemas nuevos de preguntas de seguimiento. |
| 2 | **Solver Service** | Ejecuta el algoritmo matemático real y devuelve solución + pasos. |
| 3 | **Narrador** | Traduce la solución numérica a una recomendación de negocio en el chat. |
| 4 | **Validador (LLM #2)** | Con prompt independiente y escéptico, **recalcula la aritmética por su cuenta** (valor objetivo, restricciones, fórmulas) y verifica que cada parámetro provenga del enunciado. Emite veredicto: ✅ válido / ⚠️ con observaciones / ❌ inválido, con los cálculos mostrados. |

**Modo socrático** 🎓 (interruptor en el chat): en lugar de resolver, el tutor hace 1–3 preguntas orientadoras por turno para que el estudiante identifique variables, función objetivo y restricciones por sí mismo — nunca revela el modelo completo ni el resultado, según lo exige la rúbrica.

**Anexo de Interacción con IA**: toda llamada a los LLMs queda auditada (herramienta, fecha, objetivo, prompt, respuesta, validación). El botón *"Anexo IA"* de la barra superior lo descarga en **PDF** (formato ficha, listo para el informe) o **CSV** (tabla para Excel).

**RAG**: se pueden subir PDFs desde el chat (📎); el tutor incorpora su contenido como contexto en las respuestas.

---

## Módulos y algoritmos

### 1. Programación Lineal / Entera (LP · PE)

Doble motor: **Simplex tabular propio** (paso a paso educativo, tableau por iteración) + **PuLP/CBC** (solución exacta y análisis de sensibilidad).

| Método | Cuándo se usa |
|---|---|
| **Simplex estándar** | Solo restricciones `<=` (holguras como base inicial) |
| **Dos Fases** | Hay restricciones `>=` o `=` (Fase 1 minimiza artificiales; detecta infactibilidad) |
| **Gran M** | Alternativa de una corrida, penalización M = 10⁵ |
| **Branch & Bound (CBC)** | Variables enteras o binarias (`isInteger: true`) |

Incluye análisis de sensibilidad: precios sombra, holguras, costos reducidos y rangos de RHS por perturbación numérica. *Verificado contra `scipy.optimize.linprog`.*

### 2. Transporte

Pipeline completo de aula: **Balanceo → Solución inicial (a elección) → Optimización MODI → Verificación con PuLP**.

| Algoritmo | Descripción |
|---|---|
| **Esquina Noroeste** | Asigna desde la celda superior izquierda, sin considerar costos |
| **Costo Mínimo** | Asigna siempre en la celda de menor costo disponible |
| **Vogel (VAM)** | Penalizaciones de costo de oportunidad; inicial casi óptima |
| **MODI** | Multiplicadores `uᵢ + vⱼ = cᵢⱼ`, costos reducidos `c̄ᵢⱼ = cᵢⱼ − uᵢ − vⱼ`, ciclos de ajuste θ, manejo de degeneración |

La interfaz compara el costo inicial de los tres métodos y muestra cada iteración de MODI. *Verificado: converge al mismo óptimo que PuLP desde cualquiera de las tres soluciones iniciales.*

### 3. Redes

| Algoritmo | Problema | Detalle |
|---|---|---|
| **Dijkstra** | Ruta más corta | Fija el nodo de menor distancia tentativa y relaja arcos; rechaza pesos negativos |
| **Kruskal** | Árbol de expansión mínima | Aristas ordenadas por peso + Union-Find (detección de ciclos) |
| **Edmonds-Karp** | Flujo máximo | Ford-Fulkerson con BFS sobre el grafo residual |
| **Network Simplex (NetworkX)** | Flujo de costo mínimo | Sin trazado de pasos |

*Los tres algoritmos propios verificados contra NetworkX.*

### 4. Inventarios determinísticos

| Modelo (`calc_type`) | Descripción |
|---|---|
| `eoq` | EOQ clásico: Q* = √(2DS/H) + punto de reorden + stock de seguridad |
| `eoq_discounts` | Descuentos por cantidad (procedimiento *all-units*, compara costo total con compra) |
| `eoq_backorders` | Faltantes permitidos: Q* = √((2DS/H)·((H+B)/B)) |
| `epq` | Lote económico de producción: Q* = √(2DS/(H·(1−D/P))) |
| `reorder_point` | ROP = d̄·L + Z·σ·√L |
| `abc` | Clasificación ABC por valor anual (cortes 75% / 95%) |

*El modelo de descuentos reproduce el ejemplo clásico de Render & Stair (Q*=1000 @ $4.80, CT=$24,725).*

### 5. Programación Dinámica

| Tipo (`problem_type`) | Algoritmo |
|---|---|
| `knapsack` | Mochila 0/1 — tabla DP completa (recurrencia de Bellman) + backtracking |
| `lot_sizing` | Wagner-Whitin — DP hacia atrás, reconstruye la política óptima de pedidos |

---

## Cómo se usa

1. **Por el chat (recomendado)** — abre el chat (🧠, abajo a la derecha), pega el enunciado del problema y envía. El tutor detecta el módulo, cambia de pestaña, resuelve, explica en el chat y valida con el segundo LLM. El dashboard muestra la solución y el detalle paso a paso.
2. **Modo socrático** — activa el interruptor 🎓 del chat para que el tutor te guíe con preguntas en vez de resolver.
3. **Manual** — en cualquier módulo, botón *"Editar Datos"* para llenar los parámetros con el editor visual (tablas de costos, variables, restricciones), luego *"Guardar y Resolver"* o *"Resolver"*.
4. **Evidencias** — botón *"Anexo IA (PDF)"* en la barra superior para descargar el registro de interacciones para el informe.

Cada módulo tiene URL propia (`/lp`, `/transport`, `/networks`, `/ip`, `/dp`, `/inventories`): se puede recargar, compartir el enlace o usar atrás/adelante del navegador.

---

## Problemas de ejemplo

Enunciados verificados que el intérprete resuelve correctamente (pégalos tal cual en el chat):

| Módulo | Enunciado |
|---|---|
| **PL** | Una fábrica produce sillas y mesas. Cada silla deja $15 de utilidad y usa 2 h de carpintería y 1 h de acabado. Cada mesa deja $30 y usa 4 h de carpintería y 2 h de acabado. Hay 100 h de carpintería y 40 h de acabado. Maximizar la utilidad. |
| **Transporte** | 3 plantas (Quito, Guayaquil, Cuenca) con capacidad 150/200/100 abastecen 3 centros (Norte, Centro, Sur) que demandan 130/180/140. Costos: Q-N 4, Q-C 6, Q-S 8, G-N 5, G-C 4, G-S 3, C-N 6, C-C 5, C-S 4. Minimizar el costo. |
| **Redes** | Ruta más corta de la bodega (A) a la tienda (E). Distancias: A-B 4, A-C 2, B-C 1, B-D 5, C-D 8, C-E 10, D-E 2. |
| **PE (binaria)** | Abrir centros de distribución: Quito cuesta 50 000 y genera 120 000; Guayaquil 70 000 y 150 000; Cuenca 40 000 y 90 000. Presupuesto: 100 000. ¿Dónde abrir? *(Óptimo: Quito + Cuenca, beneficio neto $120 000)* |
| **PD (mochila)** | Mochila de 10 kg. Objetos: (2 kg, valor 3), (3 kg, 4), (4 kg, 5), (5 kg, 6). Maximizar valor. |
| **Inventarios** | Demanda anual 2 000 unidades, costo de pedido $25, costo de mantener $2/unidad/año, entrega en 6 días. Calcular el EOQ. |

---

## API del backend

Base: `http://localhost:4000/api`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/models` | Modelos guardados con su última solución (PostgreSQL) |
| `PUT` | `/models/:id` | Guarda parámetros **y resuelve** (persiste la solución) |
| `POST` | `/lp/solve` | PL/PE — acepta `method`: `auto`/`simplex`/`dosfases`/`granm`/`none` |
| `POST` | `/transport/solve` | Transporte — acepta `initial_method`: `vogel`/`noroeste`/`costo_minimo` |
| `POST` | `/networks/solve` | Redes — `algorithm`: `shortest_path`/`max_flow`/`min_cost_flow`/`min_spanning_tree` |
| `POST` | `/dynamic/solve` | PD — `problem_type`: `knapsack`/`lot_sizing` |
| `POST` | `/inventories/solve` | Inventarios — `calc_type`: ver tabla de modelos |
| `POST` | `/tutor/interpret` | LLM #1: enunciado en lenguaje natural → `{isNewProblem, moduleType, data}` |
| `POST` | `/tutor/validate` | LLM #2: audita una solución → `{verdict, checks_realizados, issues}` |
| `POST` | `/tutor/socratic` | Modo socrático: solo preguntas orientadoras |
| `POST` | `/tutor/ask` | Narrador: explica la solución activa en lenguaje de negocio |
| `POST` | `/tutor/upload` | Sube un PDF al índice RAG |
| `GET` | `/audit/logs` | Log crudo de auditoría |
| `GET` | `/audit/annex` | Anexo de Interacción con IA — `?format=csv` o `?format=pdf` |

La documentación interactiva del Solver Service (FastAPI) está en `http://localhost:8000/docs`.

---

## Tecnologías

| Capa | Stack |
|---|---|
| **Frontend** | React 18, Vite 6, TypeScript, Tailwind CSS 4, shadcn/ui, react-router 7, motion (animaciones), Recharts, Leaflet (mapas) |
| **Backend** | Node.js 20, Express, TypeScript, Zod, Prisma (PostgreSQL), Mongoose (MongoDB), pdfkit |
| **Solver** | Python 3.10, FastAPI, NumPy, PuLP + CBC, NetworkX, SciPy, sentence-transformers + ChromaDB (RAG) |
| **IA** | Groq API — `llama-3.3-70b-versatile` (Resolutor, Narrador, Validador y Socrático con prompts independientes) |
| **Bases de datos** | PostgreSQL 15 (modelos y soluciones), MongoDB 6 (historial de interacciones IA) |
| **Infraestructura** | Docker, Docker Compose |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- Git
- Una clave de API de [Groq](https://console.groq.com/) (gratuita)

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Backend
PORT=4000
GROQ_API_KEY=gsk_...        # Clave de la API de Groq (requerida para el tutor)
GEMINI_API_KEY=...          # Opcional (funciones futuras)

# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres_password
POSTGRES_DB=tech_logistics

# MongoDB
MONGO_INITDB_ROOT_USERNAME=mongo_admin
MONGO_INITDB_ROOT_PASSWORD=mongo_password
MONGO_DB=tech_logistics
```

> ⚠️ El archivo `.env` está en `.gitignore`. Nunca lo subas al repositorio.

---

## Levantar el proyecto

```bash
# 1. Clonar el repositorio
git clone https://github.com/Sarlacc3010/tech-logistics-io.git
cd tech-logistics-io

# 2. Crear el archivo .env (ver sección anterior)

# 3. Levantar todos los servicios
docker-compose up -d --build

# 4. Verificar que los contenedores están corriendo
docker-compose ps
```

Una vez levantado:

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| Solver API + Docs | http://localhost:8000/docs |

### Comandos útiles

```bash
# Ver logs de un servicio
docker logs tech-logistics-io-backend-1 --tail 50 -f

# Reconstruir un servicio tras cambios en el código
# (los servicios NO montan el código como volumen: hay que reconstruir la imagen)
docker-compose build backend && docker-compose up -d --no-deps backend

# Detener todo
docker-compose down
```

---

## Estructura de carpetas

```
tech-logistics-io/
├── backend/                      # API Node.js + Express (TypeScript)
│   ├── prisma/                   # Esquema de PostgreSQL
│   └── src/
│       ├── controllers/          # tutor, solver, LP, auditoría, base de datos
│       ├── services/             # groq.service (4 prompts LLM), rag.service, solver-client
│       ├── middlewares/          # audit.middleware (registro de interacciones)
│       ├── repositories/         # audit.repository (log en archivo)
│       ├── models/               # ia-interaction.model (Mongoose)
│       └── routes/               # index.ts (todas las rutas)
├── frontend/                     # Aplicación React (TypeScript)
│   └── src/
│       ├── app/
│       │   ├── App.tsx           # Vistas de módulos, chat del tutor, enrutamiento
│       │   └── components/ui/    # Componentes shadcn/ui
│       ├── components/           # LPEditor, TransportEditor, NetworksEditor,
│       │                         # InventoriesEditor, DynamicEditor, AlgorithmSteps
│       └── styles/               # theme.css (variables claro/oscuro)
├── solver-service/               # Microservicio matemático (Python + FastAPI)
│   └── app/
│       ├── algorithms/
│       │   ├── steps.py          # SolutionStep + StepTracker (esquema común de pasos)
│       │   ├── lp/simplex.py     # Simplex, Dos Fases, Gran M (tabulares)
│       │   ├── transport/        # northwest, min_cost, vogel, modi, utils (balanceo)
│       │   └── networks/         # dijkstra, kruskal, max_flow (Edmonds-Karp)
│       ├── routers/              # lp, transport, networks, inventories, dynamic
│       └── rag_pipeline.py       # Indexación de PDFs (ChromaDB)
├── docs/
│   └── Algoritmos_de_Resolucion.docx   # Anexo técnico (métodos por módulo)
├── docker-compose.yml
└── README.md
```

---

## Limitaciones conocidas

- **Pasos no persistidos**: el flujo *"Guardar y Resolver"* persiste la solución en PostgreSQL, pero el detalle paso a paso (`steps`) solo vive en la sesión — se pierde al recargar. Persistirlo requiere una migración de Prisma.
- **Simplex educativo**: el tableau paso a paso aplica solo a variables continuas con cota inferior 0 y sin cota superior; los modelos enteros/acotados se resuelven con CBC (sin tableau) y la interfaz lo indica.
- **Log de auditoría efímero**: `audit_logs.json` vive dentro del contenedor del backend sin volumen — se reinicia al reconstruir el contenedor. El historial de chat en MongoDB sí persiste.
- **Flujo de costo mínimo**: usa NetworkX sin trazado de pasos (los otros 3 algoritmos de redes sí lo tienen).

---

## Documentación adicional

- **[docs/Algoritmos_de_Resolucion.docx](docs/Algoritmos_de_Resolucion.docx)** — anexo técnico con la explicación formal de cada método (fórmulas, procedimientos, verificaciones) listo para el informe final.
- **Anexo de Interacción con IA** — se genera en vivo desde la app (botón *"Anexo IA"*) con el formato que exige la rúbrica: herramienta, fecha, objetivo, prompt, respuesta y validación.

---

## Ramas principales

| Rama | Propósito |
|---|---|
| `Prod` | Producción estable |
| `DEV` | Desarrollo general del equipo |
| `feature/rag` | Integración RAG con ChromaDB |
| `feature/algorithms-fix` | Algoritmos completos del solver, tutor multi-LLM, modo socrático y anexo IA |
