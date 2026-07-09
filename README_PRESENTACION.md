# 🚚 Tech Logistics SCO Platform - Actualizaciones Recientes

Este documento detalla las implementaciones, mejoras y correcciones realizadas recientemente en la plataforma. Está diseñado como guía de apoyo para presentaciones y defensas técnicas del proyecto.

---

## 🏗️ 1. ¿Qué se implementó hoy?

### A. Dinamismo en la Interfaz de Usuario (Frontend)
- **Matriz de Costos Dinámica:** Anteriormente, la tabla de "Matriz de Costos" del módulo de Transporte estaba "quemada" (hardcoded) en el código. Se refactorizó el componente `TransportView` (en `App.tsx`) para que lea y genere dinámicamente sus filas y columnas basándose estrictamente en los datos provenientes de la Base de Datos (`modelData.data`). 
- **Mapeo Geográfico Real:** Se actualizó el sistema de coordenadas del mapa de Leaflet. Se reemplazaron las ciudades de prueba de Estados Unidos (Seattle, Denver, etc.) por coordenadas precisas de ciudades del Ecuador (Quito, Guayaquil, Cuenca, Manta, Esmeraldas, Loja, Machala, Ambato). Cuando se agrega un nuevo nodo, el mapa lo ubica correctamente en el territorio nacional.

### B. Mejoras en la Inteligencia Artificial (AI Tutor)
- **Ejecución y Resolución Automática (Auto-Save & Solve):** Se integró el componente del chatbot con el ciclo de vida de React. Ahora, cuando el agente de Inteligencia Artificial (Llama 3 vía Groq) decide invocar la herramienta de actualización (`update_logistics_matrix`), el Frontend captura ese evento, guarda automáticamente el JSON en la base de datos y hace una petición al motor matemático en Python para resolver el modelo. **El mapa y las tablas se actualizan en tiempo real sin requerir recargar la página ni dar clics adicionales.**
- **Reglas Estrictas de Prompting (Guardrails):** Se modificó el `groq.service.ts` para inyectar directrices críticas. La IA tiene estrictamente prohibido ejecutar alteraciones al modelo si faltan datos matemáticos fundamentales (ej. añadir una ciudad sin especificar su demanda). Esto obliga a la IA a tener un comportamiento más conversacional e interactivo, pidiendo los datos faltantes al usuario.

### C. Robustez en el Backend (Node.js & Express)
- **Validación Dimensional de Matrices:** Se implementó una capa de seguridad en el controlador (`database.controller.ts`). Antes de enviar el problema al motor de Python, el servidor verifica que las dimensiones matemáticas sean correctas:
  - `Longitud del vector de Ofertas == Filas de la Matriz de Costos`
  - `Longitud del vector de Demandas == Columnas de la Matriz de Costos`
- **Manejo de Errores Amigable:** Si la matriz es asimétrica o le faltan datos, el Backend rechaza la petición con un error HTTP 400 y devuelve un mensaje en español explicando exactamente qué dimensión falló. Esto previene que el servidor de Python colapse con un *Error 500 (Internal Server Error)*.

### D. Optimización de Entorno de Desarrollo
- Se modificó la estrategia de despliegue para el desarrollo. Se pasó de un entorno estricto 100% Docker (que tardaba ~15 minutos en recompilar por las dependencias de Python/React) a un entorno híbrido:
  - **Docker Compose:** Maneja exclusivamente las Bases de Datos (PostgreSQL, MongoDB) y el Microservicio Matemático (Python/FastAPI).
  - **Ejecución Nativa:** El Frontend (Vite) y Backend (Node) se ejecutan directamente en la terminal local (`npm run dev`), reduciendo el tiempo de compilación y reflejo de cambios a **milisegundos**.
- **Data Seeding (Inyección de Datos):** Se ejecutó el script `seed.ts` para limpiar la base de datos y poblarla con el ecosistema por defecto de las ciudades del Ecuador.

---

## 🔄 2. Flujo de Ejecución Detallado (Paso a Paso)

Este es el recorrido técnico exacto desde que el usuario escribe en el Chatbot hasta que el mapa se dibuja:

1. **Interacción (Frontend):** El usuario escribe un prompt en el Chatbot (ej. *"Añade Esmeraldas con demanda 200 y costos 14, 11, 6"*).
2. **Procesamiento de Lenguaje Natural (Backend - Groq Service):** El backend recibe el prompt, usa RAG (Generación Aumentada por Recuperación) para dar contexto logístico, y lo envía al LLM. 
3. **Decisión de la IA (Tool Calling):** El LLM procesa la solicitud, detecta que tiene todos los datos y emite una llamada a la función (Tool Call) `update_logistics_matrix`, generando un JSON actualizado con las nuevas dimensiones de la matriz.
4. **Respuesta al Frontend:** El backend envía la respuesta del chat y el JSON actualizado al frontend a través de la propiedad `newModelData`.
5. **Auto-Guardado (Frontend - React):** El componente `AiTutor` detecta la actualización y ejecuta el evento `onUpdateModelData`, el cual dispara la función `handleSaveAndSolve`.
6. **Validación de Integridad (Backend - Express):** El Frontend hace un `PUT /api/models/:id`. El controlador de Node intercepta la solicitud y valida que el tamaño de los vectores coincida con la matriz de costos. Si todo está correcto, envía el modelo al microservicio de Python.
7. **Resolución Matemática (Microservicio - Python/FastAPI):** Python recibe el problema. Si detecta que la Oferta != Demanda, aplica una función de balanceo creando Nodos Ficticios automáticamente. Luego resuelve el modelo mediante el algoritmo de Costo Mínimo / Vogel, y devuelve el plan óptimo de envío.
8. **Actualización de UI (Frontend):** Node.js actualiza PostgreSQL con la nueva matriz y la nueva solución. React recibe la respuesta y actualiza el estado `dbModels`. El cambio de estado hace que el mapa interactivo (Leaflet) trace las nuevas polilíneas de las rutas óptimas y las tablas se redibujen con los nuevos costos.

---

## 🛠️ 3. Herramientas y Tecnologías Utilizadas en el Proceso

- **Llama 3 (vía Groq Cloud):** Motor de Inteligencia Artificial que actúa como consultor estratégico (Agente). Su baja latencia permite que la toma de decisiones y el *Function Calling* ocurra en fracciones de segundo.
- **Function Calling / Tool Use:** Capacidad avanzada implementada para que el LLM no solo devuelva texto, sino que ejecute funciones estructuradas que modifiquen el software de manera determinista.
- **React.js & Vite:** Para el renderizado rápido de la interfaz. React maneja los estados globales (JSON del modelo, Rutas Óptimas) para reflejar los cambios matemáticos de forma instantánea.
- **Node.js, Express & Prisma ORM:** Actúan como middleware de validación y puente hacia la base de datos (PostgreSQL), garantizando la integridad de los datos antes de hacer cómputos pesados.
- **Python, NumPy & FastAPI:** Constituyen el núcleo de Inteligencia de Negocios (Operations Research). Se encargan de aplicar algoritmos de optimización matemática lineal y heurística pura que serían muy ineficientes de programar en JavaScript.
- **Leaflet & React-Leaflet:** Librerías de cartografía web utilizadas para traducir los nodos lógicos de transporte a representaciones visuales geolocalizadas sobre un mapa interactivo.
