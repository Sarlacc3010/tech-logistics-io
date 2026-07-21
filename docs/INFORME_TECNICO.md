# Informe Técnico — Tech Logistics IO

## Cómo está programada cada resolución y cómo funciona la aplicación

> Trabajo Final de Semestre — Investigación Operativa
> Documento técnico de acompañamiento al informe final. Explica, módulo por módulo, qué código ejecuta cada resolución (con referencia a archivo y función), y describe el funcionamiento completo de la aplicación de punta a punta.

---

## 1. Resumen general

Tech Logistics IO es una plataforma web de Investigación Operativa que resuelve los 6 modelos matemáticos exigidos por la rúbrica (Programación Lineal, Transporte, Redes, Programación Lineal Entera, Programación Dinámica Determinística e Inventarios Determinísticos) y los envuelve en un **tutor socrático de IA** que guía al estudiante en lugar de solo entregar la respuesta.

El sistema está compuesto por tres servicios independientes:

```
Frontend (React)  →  Backend (Node.js/Express)  →  Solver Service (Python/FastAPI)
     │                        │                              │
  interfaz y             orquesta el tutor IA           ejecuta los algoritmos
  formularios            (Groq + Gemini), persiste       matemáticos reales
  por módulo             en PostgreSQL/MongoDB
```

**Principio de diseño central: los modelos de lenguaje (LLMs) nunca hacen aritmética.** Su trabajo es interpretar el enunciado en lenguaje natural, convertirlo en parámetros estructurados, y traducir el resultado numérico a lenguaje de negocio. El cálculo real —sea Simplex, MODI, Dijkstra, una tabla de programación dinámica o una fórmula de EOQ— lo ejecuta siempre código Python determinista en el Solver Service. Esto es clave: la respuesta numérica no depende de que un LLM "sepa hacer cuentas" (que no es confiable), sino de algoritmos de libro verificados.

---

## 2. Cómo funciona la aplicación (flujo end-to-end)

### 2.1 Dos formas de ingresar un problema

**A. Por el chat (lenguaje natural).** El estudiante pega el enunciado del problema en el panel del tutor. Ocurre lo siguiente:

1. `POST /api/tutor/interpret` — un LLM (Groq, `llama-3.3-70b-versatile`) lee el enunciado y decide a cuál de los 6 módulos pertenece, extrayendo los parámetros exactos que ese módulo necesita (variables, restricciones, matriz de costos, nodos y arcos, etc.) en un JSON estructurado. El prompt fuerza a precomputar cualquier aritmética antes de escribir el JSON (evita que el LLM escriba `120000 - 50000` como valor, lo cual rompería el parser).
2. El frontend cambia automáticamente a la pestaña del módulo detectado y llena el formulario con esos datos.
3. Si el modo **directo** está activo, se llama al Solver Service para resolver de verdad, y un segundo LLM (**Narrador**) explica el resultado en lenguaje de negocio dentro del chat.
4. Si el modo **socrático** 🎓 está activo, el sistema **no resuelve nada todavía**: en su lugar hace 1–3 preguntas orientadoras por turno (variables de decisión, función objetivo, restricciones) para que el estudiante construya el modelo por sí mismo, sin revelar el resultado.
5. Un tercer LLM, **completamente independiente** (Google Gemini, `gemini-2.5-flash`, distinto proveedor y distinto prompt), actúa como **Validador**: recalcula la aritmética por su cuenta a partir del enunciado original y del resultado obtenido, y emite un veredicto (`válido` / `con observaciones` / `inválido`) mostrando su propio cálculo. Esto es lo que la rúbrica exige como "validación matemática o conceptual" de cada interacción con IA.

**B. Manual (formulario).** En cualquier módulo, el botón *"Editar Datos"* abre un formulario real —tablas de variables/restricciones, matriz de costos, nodos/arcos, selector de tipo de cálculo— nunca una caja de JSON crudo. Al llenar los campos y presionar *"Guardar y Resolver"*, se llama directamente al Solver Service sin pasar por ningún LLM: es la vía "estudiante ya sabe el modelo, solo quiere el cálculo".

### 2.2 Historial de ejercicios

Cada vez que se resuelve un problema —por cualquiera de las dos vías, y también cuando se explora en modo socrático sin llegar a resolver— se crea un **ejercicio nuevo e independiente** en la base de datos (`POST /api/models`). Nunca se sobreescribe un ejercicio anterior del mismo módulo. Cada interacción de IA queda auditada (herramienta usada, fecha, prompt, respuesta, validación) y etiquetada con el `id` del ejercicio al que pertenece, para poder generar el **Anexo de Interacción con IA** de un ejercicio puntual desde el botón *"Historial"*, en PDF o CSV.

### 2.3 Resiliencia del tutor

Groq atiende la interpretación y la conversación (uso frecuente, por eso usa el proveedor de mayor cuota gratuita) y Gemini valida de forma independiente. Si cualquiera de los dos agota su cuota (HTTP 429), el backend reintenta automáticamente con el otro proveedor antes de devolver un error al chat.

---

## 3. Programación Lineal y Programación Lineal Entera

**Archivos:** [`solver-service/app/algorithms/lp/simplex.py`](../solver-service/app/algorithms/lp/simplex.py), [`solver-service/app/routers/lp_router.py`](../solver-service/app/routers/lp_router.py)

Este módulo usa un **doble motor**, y es el mejor ejemplo del diseño "híbrido" de la aplicación:

- **Motor propio (`simplex.py`)**: tableau simplex implementado desde cero con `numpy`, sin ninguna librería de optimización. Contiene tres variantes:
  - `solve_standard_simplex`: Simplex tabular clásico, solo admite restricciones `<=` (todas obtienen una variable de holgura como base inicial factible).
  - `solve_two_phase`: Dos Fases — cuando hay restricciones `>=` o `=`, agrega variables artificiales, minimiza su suma en la Fase 1 (si el mínimo no es cero, el problema es infactible), y resuelve la función objetivo real en la Fase 2 sobre la base factible encontrada.
  - `solve_big_m`: Gran M — misma idea que Dos Fases pero en una sola corrida, penalizando las variables artificiales con `M = 10⁵` en la fila objetivo para forzar que salgan de la base.
  - El pivoteo (`_pivot`) y la prueba de razón mínima están escritos a mano; cada iteración se registra como un `SolutionStep` (título, explicación en texto y una foto del tableau completo) para que el frontend muestre el procedimiento paso a paso, tal como se enseña en clase.
  - **Limitación reconocida**: este motor solo soporta variables continuas, con cota inferior 0 y sin cota superior. Si el modelo tiene variables enteras/binarias o acotadas, la aplicación lo indica explícitamente y no muestra tableau (ver más abajo).

- **PuLP + CBC (`lp_router.py`)**: la respuesta *oficial* (valor objetivo, valores de las variables, análisis de sensibilidad) siempre se calcula con `pulp.PULP_CBC_CMD`, el solver de código abierto CBC. Para variables enteras (`isInteger: true`), CBC ejecuta **Branch & Bound** internamente — esta es la forma en que se resuelve el módulo de **Programación Lineal Entera (PE)**, que reutiliza exactamente este mismo endpoint.

- **Análisis de sensibilidad**: precios sombra y costo reducido salen directo de PuLP (`constraint.pi`, `variable.dj`). El rango factible de RHS (`rhsLow`/`rhsHigh`) se calcula **perturbando numéricamente** el lado derecho de cada restricción y re-resolviendo hasta que el precio sombra cambia o el problema se vuelve infactible — es un método numérico, no la fórmula analítica del tableau final, pero da el mismo resultado.

**¿Por qué dos motores?** El motor propio existe para mostrar la mecánica del algoritmo (lo que pide la rúbrica), pero PuLP/CBC da la respuesta porque maneja de forma robusta casos degenerados y variables enteras sin tener que reimplementar Branch & Bound desde cero. La rúbrica explícitamente acepta "software" como método válido para ambos módulos.

---

## 4. Transporte

**Archivos:** [`solver-service/app/algorithms/transport/`](../solver-service/app/algorithms/transport/) (`northwest.py`, `min_cost.py`, `vogel.py`, `modi.py`, `utils.py`), [`transport_router.py`](../solver-service/app/routers/transport_router.py)

Pipeline completo de aula, **100% programado desde cero** salvo la verificación final:

1. **Balanceo** (`utils.py`): si la oferta total no es igual a la demanda total, se agrega un origen o destino ficticio con costo 0.
2. **Solución inicial** (a elección del usuario, los tres implementados sin librerías):
   - `northwest.py`: Esquina Noroeste — asigna desde la celda superior izquierda sin mirar costos.
   - `min_cost.py`: Costo Mínimo — asigna siempre en la celda de menor costo disponible.
   - `vogel.py`: Aproximación de Vogel (VAM) — calcula penalizaciones de costo de oportunidad por fila/columna y asigna en la celda de menor costo de la fila o columna con mayor penalización.
3. **Optimización con MODI** (`modi.py`): a partir de la solución inicial, calcula los multiplicadores `uᵢ, vⱼ` resolviendo `uᵢ + vⱼ = cᵢⱼ` sobre las celdas básicas (fijando `u₁=0`), obtiene los costos reducidos `c̄ᵢⱼ = cᵢⱼ − uᵢ − vⱼ` de las celdas no básicas, y si alguno es negativo, arma el ciclo cerrado de ajuste (`_find_loop`/`_order_loop`) y transfiere `θ` unidades hasta que todos los costos reducidos son `≥ 0`. Incluye manejo de degeneración (`_ensure_spanning_basis` completa la base con celdas de asignación 0 si hacen falta).
4. **Verificación con PuLP**: la respuesta *oficial* (asignaciones y costo total que ve el usuario) se recalcula modelando el mismo problema como un LP en PuLP. MODI alimenta únicamente el panel de pasos — matemáticamente converge al mismo óptimo, pero PuLP es la fuente numérica final por robustez ante casos degenerados.
5. **Análisis de sensibilidad**: precios sombra de oferta/demanda (`pc.pi`) y costo de oportunidad de las rutas no usadas (`pv.dj`), combinados en la vista "Rutas principales vs. alternativas".

---

## 5. Redes

**Archivos:** [`solver-service/app/algorithms/networks/`](../solver-service/app/algorithms/networks/) (`dijkstra.py`, `kruskal.py`, `max_flow.py`), [`networks_router.py`](../solver-service/app/routers/networks_router.py)

La rúbrica exige al menos 2 de 5 modelos posibles; la aplicación implementa **3 desde cero**, sin NetworkX:

- **Dijkstra** (ruta más corta): fija en cada paso el nodo no visitado de menor distancia tentativa, relaja sus arcos salientes, y repite. Rechaza pesos negativos explícitamente (sugiere Bellman-Ford si hicieran falta).
- **Kruskal** (árbol de expansión mínima): ordena todas las aristas de menor a mayor peso y las va aceptando con una estructura Union-Find propia (`_UnionFind`) que detecta si agregar una arista cerraría un ciclo.
- **Edmonds-Karp** (flujo máximo): Ford-Fulkerson usando BFS para encontrar el camino de aumento más corto en cada iteración sobre el grafo residual, hasta que ya no queda ningún camino con capacidad residual positiva.

Un cuarto algoritmo, **flujo de costo mínimo**, usa `networkx.network_simplex` directamente (no tiene implementación propia) porque con los tres anteriores ya se cumple el requisito de la rúbrica.

> **Corrección aplicada en esta iteración**: `min_cost_flow` truncaba pesos, capacidades y demandas decimales con `int()` antes de llamar a NetworkX, perdiendo la parte decimal en silencio. Se corrigió escalando todos los valores por 1000 antes de resolver (el workaround oficial que documenta NetworkX para esta limitación) y revirtiendo la escala al devolver el resultado — verificado end-to-end: cambiar un peso de `10` a `10.5` con un flujo de 200 unidades movió el costo total de 9770 a 9870, como corresponde matemáticamente.

---

## 6. Programación Dinámica

**Archivo:** [`solver-service/app/routers/dynamic_router.py`](../solver-service/app/routers/dynamic_router.py) — **100% programado**, sin ninguna librería de optimización.

- **Mochila 0/1 (`knapsack`)**: tabla `dp[i][w]` que representa el valor máximo alcanzable usando los primeros `i` objetos con capacidad `w`, construida con la recurrencia de Bellman: `dp[i][w] = max(valor[i-1] + dp[i-1][w-peso[i-1]], dp[i-1][w])` si el objeto cabe, o `dp[i-1][w]` si no. Los objetos seleccionados se reconstruyen recorriendo la tabla hacia atrás (backtracking): si `dp[i][w] != dp[i-1][w]`, el objeto `i` se usó.
- **Tamaño de lote — Wagner-Whitin (`lot_sizing`)**: `dp[i]` es el costo mínimo para satisfacer la demanda desde el período `i` hasta el final. Se calcula hacia atrás evaluando, para cada período `i`, todos los posibles próximos puntos de pedido `j ≥ i` (costo = costo de preparación + costo de mantener acumulado + `dp[j+1]`), quedándose con el mínimo. La política óptima de pedidos se reconstruye siguiendo esos punteros desde el período 1.

> **Corrección aplicada en esta iteración**: este era el único módulo de los 6 que no generaba `steps` (detalle paso a paso), pese a que la tabla DP ya se calculaba por completo — simplemente nunca se exponía al frontend. Se agregó el registro de pasos (`StepTracker`) para ambos algoritmos: en mochila, un paso por objeto mostrando la fila completa de la tabla; en Wagner-Whitin, un paso por período mostrando `dp[i]` y hasta qué período conviene cubrir. Verificado en el navegador: el acordeón "Detalle paso a paso" ahora aparece igual que en los otros 5 módulos.

---

## 7. Inventarios determinísticos

**Archivo:** [`solver-service/app/routers/inventories_router.py`](../solver-service/app/routers/inventories_router.py) — **100% fórmulas cerradas de IO**, sin ningún solver; solo se usa `numpy` para raíces cuadradas.

| `calc_type` | Fórmula central |
|---|---|
| `eoq` | `Q* = √(2DS/H)`, más punto de reorden y stock de seguridad |
| `eoq_discounts` | Procedimiento *all-units*: calcula el EOQ en cada nivel de precio, ajusta a la cantidad factible del rango y compara el costo total de cada alternativa |
| `eoq_backorders` | `Q* = √((2DS/H)·((H+B)/B))`, con nivel máximo de faltante e inventario máximo |
| `epq` | `Q* = √(2DS/(H·(1−D/P)))`, lote económico de producción con tasa de reposición finita |
| `reorder_point` | `ROP = d̄·L + Z·σ√L` |
| `abc` | Clasificación por valor anual acumulado (cortes en 75% / 95%) |

Cada cálculo genera sus propios `steps` mostrando la sustitución numérica en la fórmula, paso a paso.

---

## 8. ¿Librerías o programado? — resumen honesto

| Categoría | Módulos/algoritmos |
|---|---|
| **100% programado desde cero** | Simplex/Dos Fases/Gran M (LP), Noroeste/Costo Mínimo/Vogel/MODI (Transporte), Dijkstra/Kruskal/Edmonds-Karp (Redes), Mochila/Wagner-Whitin (Programación Dinámica), todas las fórmulas de Inventarios |
| **Librería como respuesta oficial** | PuLP/CBC para el valor final y sensibilidad de LP, PE y Transporte (Branch & Bound para enteros no se reimplementó) |
| **Librería sin implementación propia** | NetworkX (`network_simplex`) solo para flujo de costo mínimo — no es requisito obligatorio, ya se cumple con los otros 3 algoritmos de Redes |
| **Solo para verificación en desarrollo** | SciPy (`linprog`) — no se usa en tiempo de ejecución |

La rúbrica permite explícitamente "software" como método válido en LP y PE, así que el uso de PuLP no es una desviación del requisito — es una opción contemplada. Los algoritmos que sí pide programar (Simplex/Dos Fases/Gran M, MODI, y al menos 2 de Redes) están completamente hechos a mano.

---

## 9. ¿La respuesta coincide con un simulador externo?

En el valor óptimo, sí, en la enorme mayoría de los casos — porque la respuesta final en LP, PE, Transporte y Redes sale de un solver exacto de la industria (CBC vía PuLP, `network_simplex` de NetworkX) o de algoritmos deterministas de libro (Dijkstra, Kruskal, Edmonds-Karp, DP, fórmulas cerradas de EOQ), no de aproximaciones. Dos matices a tener en cuenta al comparar:

1. **Óptimos múltiples/degenerados**: si el problema tiene más de una solución óptima, un simulador distinto puede mostrar variables o asignaciones distintas con el **mismo** valor objetivo — es normal en LP y Transporte, no un error.
2. **Balanceo de Transporte**: si oferta ≠ demanda, la aplicación agrega automáticamente un nodo ficticio de costo 0; hay que igualar esa convención si se compara contra otro simulador que maneje el desbalance de otra forma.

---

## 10. Correcciones aplicadas en esta revisión (changelog técnico)

Durante la verificación de este informe se revisó cada módulo en el navegador contra el stack real (no solo el código) y se encontraron y corrigieron los siguientes problemas:

1. **Truncamiento de decimales en `min_cost_flow`** (`networks_router.py`) — ver sección 5.
2. **Formulario de Programación Dinámica desconectado del backend real** (`DynamicEditor.tsx`) — el editor manual usaba un esquema de datos (`initialState`, `stages`, `states`, `decisions`) que no correspondía a lo que el backend espera (`problem_type`, `parameters`), así que nunca lograba mostrar un formulario real y siempre caía a edición de JSON crudo. Se reescribió por completo con selector de tipo de problema y campos propios de mochila y de tamaño de lote.
3. **Programación Entera no se podía armar a mano** (`LPEditor.tsx`) — el formulario de variables no tenía forma de marcar una variable como entera ni de ponerle cota superior, así que un ejercicio de PE construido manualmente (sin pasar por el chat) nunca podía usar variables enteras. Se agregaron ambos campos.
4. **Ejercicios de ejemplo (Redes e Inventarios) aparecían como "sin resolver"** pese a tener una solución real guardada (`seed.ts`) — la causa era que esos dos módulos leen el resultado desde un campo (`result`) que solo existe si la solución se guardó con el formato completo de respuesta del solver, y el script de siembra guardaba una versión resumida sin ese campo. Se corrigió el script de siembra para los 5 módulos que se resuelven al arrancar, y se migraron los ejercicios ya guardados en la base de datos actual.
5. **Programación Dinámica no mostraba el detalle paso a paso** — ver sección 6.

Todas las correcciones se verificaron manualmente en el navegador contra el stack completo en Docker (frontend + backend + solver-service + PostgreSQL + MongoDB), no solo por lectura de código.
