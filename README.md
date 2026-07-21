# Tech Logistics IO

Plataforma web de **Investigación Operativa** orientada a la logística, con un **Tutor Socrático de IA (arquitectura multi-LLM)** y resolución **paso a paso** de modelos matemáticos de optimización.

Desarrollada como Trabajo Final de Semestre de la asignatura de Investigación Operativa: cubre los 6 capítulos obligatorios (Programación Lineal, Transporte, Redes, Programación Lineal Entera, Programación Dinámica Determinística e Inventarios Determinísticos) y funciona como una aplicación **reutilizable** — cualquier problema nuevo puede ingresarse en lenguaje natural por el chat.

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [El Tutor de IA (multi-LLM)](#el-tutor-de-ia-multi-llm)
- [Módulos y algoritmos](#módulos-y-algoritmos)
- [Mapa real y rutas (Mapbox)](#mapa-real-y-rutas-mapbox)
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
│   · Mapa real con Mapbox GL (rutas viales, geocoding)    │
│   · Editores con formulario real por módulo              │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────────┐
│                        Backend                           │
│           Node.js + Express + TS (puerto 4000)           │
│   · Orquestación multi-LLM (Groq + Gemini, con fallback  │
│     mutuo ante rate-limit)  · RAG con PDFs                │
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
│   · Análisis de sensibilidad (precios sombra, costo de   │
│     oportunidad) en PL y Transporte                      │
│   Todos devuelven steps[] (iteraciones del algoritmo)    │
└──────────────────────────────────────────────────────────┘
```

**Principio de diseño**: los LLMs nunca hacen aritmética. Solo interpretan enunciados y explican resultados; todo cálculo lo ejecuta el Solver Service en Python, y cada algoritmo registra sus iteraciones intermedias en un esquema común de pasos (`SolutionStep`) que la interfaz muestra en un panel expandible.

---

## El Tutor de IA (multi-LLM)

El sistema usa **dos proveedores de LLM genuinamente distintos**, cada uno con un rol fijo — no es el mismo modelo con dos prompts:

| # | Rol | Proveedor | Qué hace |
|---|---|---|---|
| 1 | **Resolutor** | Groq (`llama-3.3-70b-versatile`) | Clasifica el enunciado en uno de los 6 módulos y construye el JSON de parámetros exacto (modo JSON estricto). Distingue problemas nuevos de preguntas de seguimiento. |
| 2 | **Solver Service** | — (Python) | Ejecuta el algoritmo matemático real y devuelve solución + pasos + análisis de sensibilidad. |
| 3 | **Narrador / Tutor socrático** | Groq | Traduce la solución numérica a una recomendación de negocio, o guía con preguntas en modo socrático. Se llama en cada turno del chat, por eso usa el proveedor de mayor cuota. |
| 4 | **Validador (independiente)** | Gemini (`gemini-2.5-flash`) | Con prompt propio y escéptico, **recalcula la aritmética por su cuenta** (valor objetivo, restricciones, fórmulas) y verifica que cada parámetro provenga del enunciado. Emite veredicto: ✅ válido / ⚠️ con observaciones / ❌ inválido, con los cálculos mostrados. |

**Resiliencia ante rate-limit**: Groq maneja la interpretación y la tutoría (uso frecuente, así se conserva la cuota gratuita de Gemini), y Gemini valida de forma independiente. Si cualquiera de los dos agota su cuota (HTTP 429), el backend reintenta automáticamente con el otro proveedor antes de devolver un error al chat — el estudiante no se queda sin respuesta.

**Modo socrático** 🎓 (interruptor en el chat): en lugar de resolver, el tutor hace 1–3 preguntas orientadoras por turno para que el estudiante identifique variables, función objetivo y restricciones por sí mismo — nunca revela el modelo completo ni el resultado, según lo exige la rúbrica.

**Historial y Anexo de Interacción con IA por ejercicio**: cada vez que se resuelve un problema — desde el chat (modo directo o socrático) o con el botón *"Resolver"*/*"Guardar y Resolver"* — queda guardado como un **ejercicio nuevo e independiente**; nunca se sobreescribe uno anterior del mismo módulo. Toda llamada a los LLMs queda auditada (herramienta, fecha, objetivo, prompt, respuesta, validación) y etiquetada con el ejercicio al que pertenece. El botón *"Historial"* de la barra superior abre la lista completa de ejercicios (resueltos y los que solo se exploraron en modo socrático) para elegir uno y descargar **su propio** Anexo IA en **PDF** (formato ficha, listo para el informe) o **CSV** (tabla para Excel).

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

**Análisis de sensibilidad**: además de la solución, el módulo calcula (vía PuLP: `pc.pi` para precios sombra, `pv.dj` para costo reducido) los **precios sombra** de cada origen/destino (cuánto bajaría el costo total si hubiera 1 unidad más de oferta o demanda) y el **costo de oportunidad** de las rutas que no se usan (cuánto subiría el costo total por cada unidad forzada por ahí). Ambas tablas se combinan en una vista **"Rutas principales vs. alternativas"**: las rutas que sí conviene tomar, ordenadas por volumen, junto con las que no conviene y cuánto costaría igual usarlas — respondiendo directamente qué rutas tomar y por qué.

### 3. Redes

| Algoritmo | Problema | Detalle |
|---|---|---|
| **Dijkstra** | Ruta más corta | Fija el nodo de menor distancia tentativa y relaja arcos; rechaza pesos negativos |
| **Kruskal** | Árbol de expansión mínima | Aristas ordenadas por peso + Union-Find (detección de ciclos) |
| **Edmonds-Karp** | Flujo máximo | Ford-Fulkerson con BFS sobre el grafo residual |
| **Network Simplex (NetworkX)** | Flujo de costo mínimo | Sin trazado de pasos; pesos/capacidades/demandas decimales se escalan x1000 antes de resolver para no perder precisión (workaround oficial de NetworkX) |

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

Ambos algoritmos son 100% propios (sin librerías) y devuelven `steps[]` con el detalle paso a paso de la tabla, igual que el resto de los módulos.

---

## Mapa real y rutas (Mapbox)

Los módulos de **Transporte** y **Redes** (y el resumen general) muestran un mapa real de Ecuador con Mapbox GL JS, no solo un diagrama abstracto:

- **Geocodificación real**: cada origen/destino del problema se resuelve a una coordenada real. Primero se busca en una tabla local de ciudades/hubs conocidos; si el nombre no está ahí (por ejemplo, un lugar que el estudiante escribió en el enunciado), se geocodifica en vivo contra la **Geocoding API de Mapbox**, restringida a Ecuador y cacheada en `localStorage` para no repetir búsquedas.
- **Rutas viales reales**: la línea entre dos nodos se dibuja primero como línea recta (respuesta inmediata) y se reemplaza en cuanto llega la respuesta de la **Directions API de Mapbox** con la geometría real de la carretera — incluyendo la **distancia real en kilómetros**, mostrada en el mapa y en las tablas de rutas.
- **Zoom hasta nivel de calle** (hasta z18): pensado para poder simular reparto **dentro de una misma ciudad** (varios locales/puntos de entrega), no solo rutas entre ciudades.
- **Tema claro/oscuro**: el mapa cambia de estilo (`streets-v12` / `dark-v11`) junto con el resto de la interfaz.

Requiere un token público de Mapbox (`VITE_MAPBOX_TOKEN`, ver [Variables de entorno](#variables-de-entorno)) — es un token `pk.*`, diseñado para exponerse en el cliente.

---

## Cómo se usa

1. **Por el chat (recomendado)** — abre el chat (🧠, abajo a la derecha), pega el enunciado del problema y envía. El tutor detecta el módulo, cambia de pestaña, resuelve, explica en el chat y valida con el segundo LLM. El dashboard muestra la solución y el detalle paso a paso.
2. **Modo socrático** — activa el interruptor 🎓 del chat para que el tutor te guíe con preguntas en vez de resolver.
3. **Manual** — en cualquier módulo, botón *"Editar Datos"* para llenar los parámetros con un **formulario real** (tablas de costos, variables, restricciones, selector de algoritmo en Redes, selector de tipo de cálculo en Inventarios) — no una caja de JSON crudo — luego *"Guardar y Resolver"* o *"Resolver"*.
4. **Evidencias** — botón *"Historial"* en la barra superior: lista todos los ejercicios resueltos (o solo explorados en modo socrático) y descarga el Anexo IA de cada uno por separado, en PDF o CSV, para el informe.

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
| `GET` | `/models` | Todos los ejercicios guardados (historial completo, no solo el último por módulo), con su solución más reciente (PostgreSQL) |
| `POST` | `/models` | Crea un ejercicio **nuevo** — nunca sobreescribe uno anterior del mismo módulo. `{id?, type, data, solve = true}`; con `solve: false` se guarda sin resolver (modo socrático) |
| `POST` | `/models/:id/solve` | Resuelve un ejercicio ya creado sin resolver (ej. tras explorarlo en modo socrático y luego pedir la solución) |
| `POST` | `/lp/solve` | PL/PE — acepta `method`: `auto`/`simplex`/`dosfases`/`granm`/`none` (cálculo puntual, sin persistir) |
| `POST` | `/transport/solve` | Transporte — acepta `initial_method`: `vogel`/`noroeste`/`costo_minimo`; devuelve además `supply_duals`, `demand_duals` y `opportunity_costs` (sensibilidad) |
| `POST` | `/networks/solve` | Redes — `algorithm`: `shortest_path`/`max_flow`/`min_cost_flow`/`min_spanning_tree` |
| `POST` | `/dynamic/solve` | PD — `problem_type`: `knapsack`/`lot_sizing` |
| `POST` | `/inventories/solve` | Inventarios — `calc_type`: ver tabla de modelos |
| `POST` | `/tutor/interpret` | LLM #1: enunciado en lenguaje natural → `{isNewProblem, moduleType, data}`. Acepta `modelId` opcional para etiquetar la interacción con un ejercicio |
| `POST` | `/tutor/validate` | LLM #2: audita una solución → `{verdict, checks_realizados, issues}` |
| `POST` | `/tutor/socratic` | Modo socrático: solo preguntas orientadoras |
| `POST` | `/tutor/ask` | Narrador: explica la solución activa en lenguaje de negocio |
| `POST` | `/tutor/upload` | Sube un PDF al índice RAG |
| `GET` | `/audit/logs` | Log crudo de auditoría |
| `GET` | `/audit/annex` | Anexo de Interacción con IA de **todo** el historial — `?format=csv` o `?format=pdf` |
| `GET` | `/audit/annex?modelId=X` | Anexo de Interacción con IA de **un solo ejercicio** (lo que usa el panel "Historial") |

La documentación interactiva del Solver Service (FastAPI) está en `http://localhost:8000/docs`.

---

## Tecnologías

| Capa | Stack |
|---|---|
| **Frontend** | React 18, Vite 6, TypeScript, Tailwind CSS 4, shadcn/ui, react-router 7, motion (animaciones), Recharts, Mapbox GL JS (mapa, Directions API, Geocoding API) |
| **Backend** | Node.js 20, Express, TypeScript, Zod, Prisma (PostgreSQL), Mongoose (MongoDB), pdfkit |
| **Solver** | Python 3.10, FastAPI, NumPy, PuLP + CBC, NetworkX, SciPy, sentence-transformers + ChromaDB (RAG) |
| **IA** | Groq API — `llama-3.3-70b-versatile` (Resolutor, Narrador, Socrático) + Google Gemini API — `gemini-2.5-flash` (Validador independiente), con fallback mutuo |
| **Bases de datos** | PostgreSQL 15 (modelos y soluciones), MongoDB 6 (historial de interacciones IA) |
| **Infraestructura** | Docker, Docker Compose |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- Git
- Una clave de API de [Groq](https://console.groq.com/) (gratuita)
- Una clave de API de [Google Gemini](https://aistudio.google.com/apikey) (gratuita, para el Validador)
- Un token público de [Mapbox](https://account.mapbox.com/access-tokens/) (gratuito, para el mapa)

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Backend
PORT=4000
GROQ_API_KEY=gsk_...              # Clave de la API de Groq (Resolutor/Narrador/Socrático)
GEMINI_API_KEY=AIza...            # Clave de la API de Gemini (Validador independiente)

# Frontend (se inyecta en build time — ver docker-compose.yml / frontend/Dockerfile)
VITE_MAPBOX_TOKEN=pk....          # Token público de Mapbox (mapa, Directions, Geocoding)

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
>
> `VITE_MAPBOX_TOKEN` es distinto a los otros: Vite lo incrusta en el bundle del frontend **en build time**, no en runtime. Si lo cambias, hay que reconstruir la imagen del frontend (`docker compose build frontend`), no solo reiniciar el contenedor.

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

> ⏱️ El primer build tarda unos minutos (el `solver-service` instala PyTorch +
> sentence-transformers + ChromaDB para el RAG de PDFs). Los builds siguientes
> en la misma máquina son bastante más rápidos: `pip`/`npm` reutilizan sus
> paquetes ya descargados (cache de BuildKit) y Docker solo reinstala si
> `requirements.txt`/`package.json` cambiaron. `sentence-transformers` instala
> la build de PyTorch **solo-CPU** (no la de CUDA, mucho más pesada) porque
> aquí no hace falta GPU — esto por sí solo recorta el build en varios minutos
> y varios GB.

> 🗄️ **La base de datos se prepara sola en el primer arranque.** El backend
> sincroniza el esquema de Prisma contra Postgres (`prisma db push`) y siembra
> un ejercicio de ejemplo por módulo — no hace falta correr ningún comando
> aparte. Es idempotente y seguro para reiniciar: si ya hay datos guardados
> (un `Project` existente), el seed se salta solo y no borra nada. Antes de
> este cambio, un Postgres recién creado se quedaba sin tablas y el backend
> "arrancaba" pero cada petición fallaba — si a tu compañero el sistema no le
> funcionó después de un build largo, era por esto.

Una vez levantado:

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| Solver API + Docs | http://localhost:8000/docs |

### Acceder desde otra PC en la misma red

El frontend detecta automáticamente el host con el que se abrió la página
(`window.location.hostname`) para saber a qué backend llamar — no depende de
`localhost` fijo. Para usarlo desde otra computadora en la misma red (WiFi/LAN):

1. En la PC que corre Docker, averigua tu IP local: `ipconfig` (Windows, busca
   la sección "Wi-Fi" o "Ethernet") o `ip addr` (Linux/macOS).
2. Desde la otra PC, abre `http://<esa-ip>:5173` (ej. `http://192.168.1.5:5173`).
3. Si no conecta, revisa que el Firewall de Windows permita conexiones
   entrantes a Docker Desktop / Node.js en la red "Privada" — Docker suele
   crear estas reglas automáticamente, pero conviene confirmarlo.

El backend ya tiene CORS abierto (`origin: '*'`), así que no hace falta tocar
nada del lado del servidor más allá del firewall.

### Comandos útiles

```bash
# Ver logs de un servicio
docker logs tech-logistics-io-backend-1 --tail 50 -f

# Reconstruir un servicio tras cambios en el código
# (los servicios NO montan el código como volumen: hay que reconstruir la imagen)
docker-compose build backend && docker-compose up -d --no-deps backend

# Volver a sincronizar el esquema o resembrar datos a mano (normalmente no
# hace falta, el backend ya lo hace solo al arrancar)
docker compose exec backend npm run db:push
docker compose exec backend npm run db:seed   # borra y vuelve a crear los 5 ejercicios de ejemplo

# Empezar de cero por completo (borra los datos guardados en Postgres/Mongo)
docker compose down -v

# Detener todo (conserva los datos)
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
│       ├── services/             # groq.service, gemini.service, rag.service, solver-client
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
│   ├── INFORME_TECNICO.md              # Cómo está programado cada método + changelog
│   └── Algoritmos_de_Resolucion.docx   # Anexo técnico (métodos por módulo)
├── docker-compose.yml
└── README.md
```

---

## Limitaciones conocidas

- **El historial crece con cada clic en "Resolver"**: cada resolución (chat o botón manual) crea un ejercicio nuevo en PostgreSQL, aunque solo se haya cambiado un parámetro para probar — no hay una noción de "borrador" separada de "ejercicio guardado". No hay endpoint para eliminar ejercicios del historial todavía.
- **Simplex educativo**: el tableau paso a paso aplica solo a variables continuas con cota inferior 0 y sin cota superior; los modelos enteros/acotados se resuelven con CBC (sin tableau) y la interfaz lo indica.
- **Log de auditoría efímero**: `audit_logs.json` vive dentro del contenedor del backend sin volumen — se reinicia al reconstruir el contenedor. El historial de chat en MongoDB sí persiste.
- **Flujo de costo mínimo**: usa NetworkX sin trazado de pasos (los otros 3 algoritmos de redes sí lo tienen).

---

## Documentación adicional

- **[docs/INFORME_TECNICO.md](docs/INFORME_TECNICO.md)** — informe técnico detallado: cómo está programado cada método (con referencia a archivo/función), cómo funciona la app de punta a punta, qué es propio y qué usa librerías, y el changelog de correcciones aplicadas en la última revisión.
- **[docs/Algoritmos_de_Resolucion.docx](docs/Algoritmos_de_Resolucion.docx)** — anexo técnico con la explicación formal de cada método (fórmulas, procedimientos, verificaciones) listo para el informe final.
- **Anexo de Interacción con IA** — se genera en vivo desde la app (botón *"Historial"*, uno por ejercicio o el conjunto completo vía `/api/audit/annex`) con el formato que exige la rúbrica: herramienta, fecha, objetivo, prompt, respuesta y validación.

---

## Ramas principales

| Rama | Propósito |
|---|---|
| `Prod` | **Rama por defecto del repositorio en GitHub** — producción estable. Los Pull Requests se dirigen aquí. |
| `DEV` | Desarrollo general del equipo; tiene una implementación anterior y más simple del tutor de IA (`ai.controller.ts`), superada por la de `feature/algorithms-fix`. |
| `feature/rag` | Punto de partida para integrar RAG con ChromaDB (sin commits propios adicionales todavía). |
| `feature/algorithms-fix` | Algoritmos completos del solver, tutor multi-LLM con fallback, modo socrático, anexo IA, mapa Mapbox y análisis de sensibilidad. |

> ⚠️ `main` existe como rama pero está desactualizada (le falta incluso el commit base de Transporte/UI que ya tiene `Prod`) y **no** es la rama por defecto de GitHub — no usarla como destino de PRs.
