# Tech Logistics IO

Plataforma web de **Investigación Operativa** orientada a la logística, con un tutor socrático de IA y resolución paso a paso de modelos matemáticos de optimización.

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Módulos y algoritmos](#módulos-y-algoritmos)
- [Tecnologías](#tecnologías)
- [Requisitos previos](#requisitos-previos)
- [Variables de entorno](#variables-de-entorno)
- [Levantar el proyecto](#levantar-el-proyecto)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Ramas principales](#ramas-principales)

---

## Arquitectura

El sistema está compuesto por **tres servicios** orquestados con Docker Compose:

```
┌─────────────────────────────────────────────────────────┐
│                        Frontend                         │
│              React + Vite  (puerto 5173)                │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────┐
│                        Backend                          │
│              Node.js + Express (puerto 4000)            │
│   · Rutas de solver   · Tutor IA (Groq)                 │
│   · Auditoría (PostgreSQL + MongoDB)                    │
│   · RAG con PDFs                                        │
└──────────────┬─────────────────────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────────────────────┐
│                    Solver Service                       │
│              Python + FastAPI  (puerto 8000)            │
│   · LP / PLE  · Transporte  · Redes                    │
│   · Inventarios  · Programación Dinámica                │
└─────────────────────────────────────────────────────────┘
```

---

## Módulos y algoritmos

### 1. Programación Lineal / Entera (LP/IP)

Doble motor: **PuLP + CBC** para la solución exacta y un **Simplex tabular propio** para los pasos educativos.

| Método | Cuándo se usa |
|---|---|
| **Simplex Estándar** | Solo restricciones `<=` |
| **Dos Fases** | Hay restricciones `>=` o `=` |
| **Gran M** | Alternativa a Dos Fases con penalización M = 1e5 |

Incluye análisis de sensibilidad (precio sombra, rangos de RHS, costos reducidos).

### 2. Transporte

Pipeline: Balanceo → Solución inicial → Optimización MODI → Verificación PuLP.

| Algoritmo | Descripción |
|---|---|
| **Esquina Noroeste** | Asignación desde (0,0), sin considerar costos |
| **Costo Mínimo** | Asigna siempre en la celda de menor costo disponible |
| **Vogel (VAM)** | Usa penalizaciones de oportunidad, más cercano al óptimo |
| **MODI** | Optimización por multiplicadores `u_i, v_j` y ciclos de ajuste θ |

### 3. Redes

| Algoritmo | Problema |
|---|---|
| **Dijkstra** | Ruta más corta (pesos no negativos) |
| **Kruskal** | Árbol de expansión mínima (Union-Find) |
| **Edmonds-Karp** | Flujo máximo (Ford-Fulkerson + BFS) |
| **NetworkX Simplex** | Flujo de costo mínimo |

### 4. Inventarios

| Modelo | Descripción |
|---|---|
| `eoq` | Cantidad Económica de Pedido clásica + ROP + stock de seguridad |
| `eoq_discounts` | EOQ con descuentos por cantidad |
| `eoq_backorders` | EOQ con faltantes permitidos |
| `epq` | Lote Económico de Producción |
| `reorder_point` | Punto de reorden con stock de seguridad |
| `abc` | Clasificación ABC de SKUs (cortes 75% / 95%) |

### 5. Programación Dinámica

| Tipo | Algoritmo |
|---|---|
| `knapsack` | Mochila 0/1 — tabla DP + backtracking |
| `lot_sizing` | Wagner-Whitin — DP hacia atrás para dimensionamiento de lotes |

### 6. Tutor IA (Groq)

- **Intérprete**: convierte enunciados en lenguaje natural al JSON del solver correcto.
- **Validador**: verifica aritméticamente la solución generada.
- **Tutor socrático**: guía al estudiante con preguntas, sin dar la respuesta directa.
- **Consultor ejecutivo**: traduce la solución matemática a lenguaje de negocio.
- **RAG**: incorpora contexto de PDFs subidos por el usuario.

---

## Tecnologías

| Capa | Stack |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, CSS Modules |
| **Backend** | Node.js 20, Express, TypeScript, Prisma (PostgreSQL), Mongoose (MongoDB) |
| **Solver** | Python 3.10, FastAPI, NumPy, PuLP (CBC), NetworkX, sentence-transformers, ChromaDB |
| **IA** | Groq API — `llama-3.3-70b-versatile` |
| **Bases de datos** | PostgreSQL 15, MongoDB 6 |
| **Infraestructura** | Docker, Docker Compose |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- Git

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables (hay un `.env.example` de referencia):

```env
# Backend
PORT=4000
GROQ_API_KEY=gsk_...        # Clave de la API de Groq
GEMINI_API_KEY=...           # Clave de Gemini (opcional, para funciones futuras)

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
cp .env.example .env   # si existe, o créalo manualmente

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

# Reiniciar un servicio tras cambios
docker-compose up -d --build backend

# Detener todo
docker-compose down
```

---

## Estructura de carpetas

```
tech-logistics-io/
├── backend/                    # API Node.js + Express
│   └── src/
│       ├── controllers/        # Lógica de los endpoints
│       ├── services/           # groq.service.ts, rag.service.ts
│       ├── routes/             # Definición de rutas
│       └── middlewares/        # Auditoría
├── frontend/                   # Aplicación React
│   └── src/
│       ├── app/                # App.tsx (enrutamiento principal)
│       ├── components/         # LPEditor, TransportEditor, AlgorithmSteps, etc.
│       └── styles/             # theme.css
├── solver-service/             # Microservicio Python
│   └── app/
│       ├── algorithms/
│       │   ├── lp/             # simplex.py
│       │   ├── transport/      # northwest, min_cost, vogel, modi
│       │   ├── networks/       # dijkstra, kruskal, max_flow
│       │   └── steps.py        # StepTracker compartido
│       └── routers/            # lp, transport, networks, inventories, dynamic
├── docker-compose.yml
└── .gitignore
```

---

## Ramas principales

| Rama | Propósito |
|---|---|
| `main` | Producción estable |
| `DEV` | Desarrollo general del equipo |
| `feature/rag` | Integración RAG con ChromaDB |
| `feature/algorithms-fix` | Algoritmos completos del solver + fix rate limit Groq |