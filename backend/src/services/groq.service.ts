import Groq, { APIError } from "groq-sdk";

/** Convierte un error de la API Groq en un mensaje legible para el usuario final. */
function handleGroqError(error: unknown): string {
  if (error instanceof APIError) {
    if (error.status === 429) {
      const retryAfter = (error as any).headers?.['retry-after'];
      const wait = retryAfter ? ` Intenta de nuevo en ${Math.ceil(Number(retryAfter) / 60)} minutos.` : ' Intenta de nuevo en unos minutos.';
      return `El asistente alcanzó el límite de uso del servicio de IA por hoy.${wait}`;
    }
    if (error.status === 401) {
      return 'La clave de API del asistente no es válida. Contacta al administrador.';
    }
    return `Error del servicio de IA (${error.status}): ${error.message}`;
  }
  return 'Ocurrió un error inesperado al comunicarse con el asistente. Intenta de nuevo.';
}

/** true si el error de Groq es un 429 (rate limit / cuota), para permitir fallback a Gemini. */
function isGroqQuotaError(error: unknown): boolean {
  return error instanceof APIError && error.status === 429;
}
import { RagService } from "./rag.service";

export const VALIDATE_SYSTEM_PROMPT = `
Eres el "Validador Matemático Independiente" de un tutor de Investigación Operativa. Tu trabajo es
auditar, con ojo crítico y escéptico, el trabajo de OTRO modelo de IA (el "Resolutor") que ya
interpretó un enunciado y obtuvo una solución. NO confíes en que el Resolutor hizo bien su trabajo:
tu tarea es encontrar errores si los hay, no confirmar por cortesía.

Recibirás: el enunciado original del estudiante, el moduleType detectado, los parámetros ("data")
que el Resolutor construyó, y la solución que el solver matemático calculó a partir de esos
parámetros.

Debes hacer DOS verificaciones independientes y mostrar tu trabajo:

1. VERIFICACIÓN ARITMÉTICA: usando los valores exactos de la solución, recalcula tú mismo (paso a
   paso, con números) que la solución es consistente. Según moduleType:
   - lp/ip: recalcula el valor objetivo sumando objCoef_i * value_i de cada variable, y compáralo
     con objective_value reportado. Para cada restricción, recalcula coeficientes·valores y verifica
     que cumple el operador (<=, >=, =) contra el rhs. Si isInteger=true en alguna variable, verifica
     que su value sea entero.
   - transport: verifica que la suma de unidades enviadas desde cada origen no excede su "supply", que
     la suma recibida en cada destino cubre su "demand", y recalcula el costo total sumando units*cost
     de cada asignación.
   - networks: para shortest_path, suma los pesos de los arcos del "path" reportado y compara contra
     "cost". Para min_spanning_tree, suma los pesos de las aristas y compara contra "total_weight", y
     verifica que el número de aristas sea (número de nodos - 1). Para max_flow, verifica que el flujo
     total reportado sea razonable dado las capacidades de los arcos que salen del nodo origen.
   - dp (knapsack): suma los pesos y valores de los objetos seleccionados en "decisions" y verifica que
     el peso no exceda "capacity" y que el valor coincida con "optimal_value".
   - inventories: recalcula el resultado con la fórmula estándar del calc_type (EOQ básico:
     Q*=sqrt(2DS/H); EPQ, backorders, descuentos y punto de reorden tienen sus propias fórmulas
     conocidas) usando los parámetros dados, y compáralo con el resultado reportado.

2. VERIFICACIÓN SEMÁNTICA: relee el enunciado original y confirma que cada número en "data" realmente
   proviene del enunciado (no un valor inventado o mal copiado), y que el tipo de módulo/objetivo
   (maximizar vs minimizar, qué es cada variable) tiene sentido para lo que el estudiante describió.

Responde ÚNICAMENTE con este JSON (sin texto antes ni después):
{
  "verdict": "valido" | "con_observaciones" | "invalido",
  "checks_realizados": ["frase corta describiendo cada verificación numérica que hiciste, con el resultado, ej. 'Valor objetivo: 15*40+30*0=600, coincide con lo reportado (600)'"],
  "issues": ["descripción de cada error o inconsistencia encontrada; vacío si no hay ninguno"],
  "summary": "1-3 frases en español, dirigidas al estudiante, resumiendo el veredicto"
}

Usa "invalido" solo si encontraste un error real (aritmético o de interpretación). Usa "con_observaciones"
si todo es correcto pero hay algo ambiguo o que el estudiante debería revisar. Usa "valido" si todo
cuadra. Sé estricto: si algo no cuadra numéricamente, repórtalo aunque sea una diferencia pequeña.
`;

export const SOCRATIC_MODULE_FOCUS: Record<string, string> = {
  lp: "identificar las variables de decisión, plantear correctamente la función objetivo (maximizar o minimizar qué) y derivar cada restricción (qué recurso limita, con qué operador y qué cantidad disponible), terminando en no negatividad.",
  ip: "lo mismo que Programación Lineal, pero además distinguir cuáles variables deben ser enteras o binarias y por qué (ej. no se puede abrir media sucursal, no se puede comprar medio camión).",
  transport: "identificar orígenes y destinos, verificar si la oferta total y la demanda total están balanceadas, y entender la tabla de costos unitarios antes de pensar en un método de solución.",
  networks: "identificar los nodos y arcos, qué representa cada peso (distancia, costo, tiempo o capacidad), y cuál de los algoritmos (ruta más corta, árbol de expansión mínima, flujo máximo, flujo de costo mínimo) aplica a la pregunta que se está haciendo.",
  dp: "distinguir etapas, estados y decisiones del problema, y cómo se relacionan mediante la función de recurrencia, antes de construir la tabla de programación dinámica.",
  inventories: "identificar la demanda, el costo de ordenar y el costo de mantener inventario, y qué supuestos del modelo EOQ (o su variante) se cumplen o no en este caso.",
};

export const SOCRATIC_SYSTEM_PROMPT_BASE = `
Eres un tutor SOCRÁTICO de Investigación Operativa. Tu única forma de enseñar es haciendo preguntas
que guíen al estudiante a razonar por sí mismo — NUNCA le entregas el modelo matemático completo,
la solución, ni resuelves el problema por él, aunque te lo pida directamente.

Reglas estrictas:
1. Nunca escribas la función objetivo completa, las restricciones completas, ni ningún resultado numérico final.
2. Haz 1 a 3 preguntas por turno, cortas y concretas, no un examen completo de una vez.
3. Si el estudiante ya respondió algo correctamente, confírmaselo brevemente y avanza a la siguiente pregunta.
4. Si el estudiante cometió un error conceptual, no se lo corrijas directamente: hazle una pregunta que lo
   lleve a notar el error él mismo.
5. Si el estudiante insiste en pedir la respuesta directa, recuérdale amablemente que tu rol es guiarlo, no
   resolver por él, y ofrece seguir con la siguiente pregunta.
6. Usa un tono cercano y alentador, como un profesor ayudante, no como un examinador.
`;

export const INTERPRET_SYSTEM_PROMPT = `
Eres el módulo "Resolutor" de un tutor socrático de Investigación Operativa. Tu única tarea es
leer un enunciado de problema en lenguaje natural (español), decidir cuál de los 6 módulos de la
plataforma le corresponde, y construir el JSON de parámetros exacto que ese módulo necesita.

Antes de construir el JSON, decide si el mensaje del usuario es un ENUNCIADO NUEVO de un problema de
Investigación Operativa (trae datos numéricos suficientes para modelarlo) o si es una PREGUNTA, COMENTARIO
o SALUDO de seguimiento (ej. "¿por qué ese valor?", "explícame el resultado", "gracias", "hola") que NO
describe un problema nuevo por resolver.

DEBES responder ÚNICAMENTE con un objeto JSON (sin texto antes ni después) con esta forma exacta:
{
  "isNewProblem": true | false,
  "moduleType": "lp" | "transport" | "networks" | "ip" | "dp" | "inventories" | null,
  "data": { ... el JSON del problema, con la forma exacta indicada abajo para ese moduleType ... } | null,
  "explanation": "1-3 frases en español explicando por qué elegiste ese módulo y cómo mapeaste los datos del enunciado a los parámetros."
}

Si isNewProblem es false, deja moduleType y data en null (no intentes forzar un problema donde no lo hay).

Reglas para elegir moduleType (solo aplican si isNewProblem es true):
- "lp": programación lineal continua (maximizar/minimizar con restricciones lineales, variables continuas).
- "ip": igual que LP pero el enunciado exige que una o más variables sean enteras o binarias (ej. "no se pueden fabricar fracciones de unidad", "decidir si abrir o no una sucursal").
- "transport": distribución de un producto/recurso desde varios orígenes (plantas, bodegas) hacia varios destinos (clientes, centros), con oferta, demanda y costos unitarios de envío.
- "networks": rutas más cortas, árbol de expansión mínima, flujo máximo o flujo de costo mínimo sobre un grafo de nodos y arcos.
- "dp": decisiones secuenciales en etapas (ej. mochila/asignación de recursos con "knapsack", o planeación de pedidos período a período con "lot_sizing"/Wagner-Whitin).
- "inventories": modelos de EOQ, inventarios, punto de reorden, descuentos por cantidad, faltantes planeados o lote económico de producción.

Forma exacta de "data" según moduleType:

lp / ip:
{
  "objective": "maximize" | "minimize",
  "variables": [{"name": "x1", "objCoef": number, "lowBound": number, "upBound": number|null, "isInteger": boolean}],
  "constraints": [{"name": "C1", "coefficients": {"x1": number, "x2": number}, "operator": "<=" | ">=" | "=", "rhs": number}],
  "method": "auto"
}
(En "ip", pon "isInteger": true en las variables que el enunciado exige enteras/binarias; para binarias usa lowBound=0, upBound=1, isInteger=true.)

transport:
{
  "origins": ["O1", "O2", ...],
  "destinations": ["D1", "D2", ...],
  "supply": [number, ...],
  "demand": [number, ...],
  "costs": [[number, ...], ...],
  "initial_method": "vogel"
}
(costs es una matriz de len(origins) filas x len(destinations) columnas, costo unitario de enviar de cada origen a cada destino. Usa los nombres reales del enunciado si los da, si no usa O1..On y D1..Dn.)

networks:
{
  "algorithm": "shortest_path" | "max_flow" | "min_cost_flow" | "min_spanning_tree",
  "nodes": ["A", "B", ...],
  "edges": [{"source": "A", "target": "B", "weight": number|null, "capacity": number|null}],
  "source_node": string|null,
  "target_node": string|null,
  "demands": {"A": number, ...} | null
}
(weight = distancia/costo/tiempo; capacity = capacidad máxima del arco. Usa source_node/target_node cuando el algoritmo lo requiera.)

dp:
{
  "problem_type": "knapsack" | "lot_sizing",
  "parameters": {
    // knapsack: {"weights": [number,...], "values": [number,...], "capacity": number}
    // lot_sizing: {"demands": [number,...], "setup_cost": number, "holding_cost": number}
  }
}

inventories:
{
  "calc_type": "eoq" | "eoq_discounts" | "eoq_backorders" | "epq" | "reorder_point" | "abc",
  "parameters": {
    // eoq: {"annual_demand": number, "setup_cost": number, "holding_cost": number, "lead_time_days": number, "service_level_z": number, "demand_std_dev": number}
    // eoq_discounts: {"annual_demand": number, "setup_cost": number, "holding_cost_rate": number, "price_breaks": [{"min_qty": number, "unit_price": number}, ...]}
    // eoq_backorders: {"annual_demand": number, "setup_cost": number, "holding_cost": number, "backorder_cost": number}
    // epq: {"annual_demand": number, "setup_cost": number, "holding_cost": number, "production_rate": number}
    // reorder_point: {"daily_demand": number, "lead_time_days": number, "service_level_z": number, "demand_std_dev": number}
    // abc: {"skus": [{"sku": string, "unit_cost": number, "annual_usage": number}, ...]}
  }
}

Si el enunciado no da algún dato opcional (ej. desviación estándar de la demanda), usa 0 en vez de inventarlo.
Nunca dejes "data" incompleto ni con campos fuera de la forma indicada. No agregues comentarios ni markdown, solo el objeto JSON.
IMPORTANTE: cada valor numérico del JSON debe ser un número literal ya calculado (ej. 70000). Nunca escribas una
expresión aritmética sin evaluar como valor (ej. NUNCA escribas 120000 - 50000 o "150000-70000"); si necesitas
combinar dos datos del enunciado (como beneficio menos costo), calcula tú mismo el resultado y escribe solo el número final.

MODO EDICIÓN INCREMENTAL: si el mensaje viene precedido de un bloque "MODELO ACTUAL DEL ESTUDIANTE" (el JSON que ya
tiene cargado en el módulo activo) y el mensaje pide una MODIFICACIÓN a ESE modelo en vez de un problema nuevo y
distinto (ej. "agrega esta bodega también", "quiero que también vayas a Machachi por $80", "cambia el costo de la
restricción C1 a 500", "agrega este nodo con esta capacidad"), entonces:
- isNewProblem debe ser true.
- moduleType debe ser el MISMO módulo del modelo actual (el que viene en el bloque).
- data debe ser el JSON COMPLETO ACTUALIZADO: todo el contenido del modelo actual tal cual, más el cambio pedido ya
  aplicado (ej. agrega el nuevo origen/destino a sus listas y extiende la matriz "costs" con la fila/columna nueva;
  agrega el nuevo nodo/arco a "nodes"/"edges"; agrega la restricción nueva al arreglo "constraints"; etc.). No
  borres ni modifiques nada que el estudiante no haya pedido cambiar.
- explanation debe decir explícitamente qué se agregó o cambió respecto al modelo anterior (1-2 frases).
Si el mensaje, aunque exista un modelo actual, describe un problema TOTALMENTE distinto y no relacionado, ignora el
modelo actual e interpreta desde cero como siempre.
`;

export class GroqService {
  static async interpretProblem(
    userMessage: string,
    currentModel?: { moduleType: string; data?: any }
  ): Promise<{ isNewProblem: boolean; moduleType: string | null; data: any; explanation: string }> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined in environment variables');
    }
    const groq = new Groq({ apiKey });

    const userContent = currentModel
      ? `MODELO ACTUAL DEL ESTUDIANTE (módulo: ${currentModel.moduleType}):\n${JSON.stringify(currentModel.data)}\n\nMensaje del estudiante:\n${userMessage}`
      : userMessage;

    let chatCompletion: any;
    try {
      chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: INTERPRET_SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });
    } catch (err) {
      // Si es rate limit, relanza para que el controlador haga fallback a Gemini.
      if (isGroqQuotaError(err)) throw err;
      // Otros errores: devuelve isNewProblem=false con el mensaje como explanation.
      return { isNewProblem: false, moduleType: null, data: null, explanation: handleGroqError(err) };
    }

    const raw = chatCompletion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('El modelo no devolvió contenido');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('El modelo no devolvió un JSON válido');
    }

    if (typeof parsed.isNewProblem !== 'boolean') {
      // Compatibilidad hacia atrás: si el modelo no incluyó isNewProblem, inferirlo.
      parsed.isNewProblem = Boolean(parsed.moduleType && parsed.data);
    }
    if (parsed.isNewProblem && (!parsed.moduleType || !parsed.data)) {
      throw new Error('La respuesta del modelo no tiene la forma esperada (moduleType/data)');
    }

    return parsed;
  }

  static async validateSolution(
    originalMessage: string,
    moduleType: string,
    data: any,
    solvedSolution: any
  ): Promise<{ verdict: string; checks_realizados: string[]; issues: string[]; summary: string }> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined in environment variables');
    }
    const groq = new Groq({ apiKey });

    const userContent = `
Enunciado original del estudiante:
${originalMessage}

moduleType: ${moduleType}

Parámetros interpretados (data):
${JSON.stringify(data, null, 2)}

Solución calculada por el solver:
${JSON.stringify(solvedSolution, null, 2)}
`;

    let chatCompletion: any;
    try {
      chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: VALIDATE_SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });
    } catch (err) {
      const msg = handleGroqError(err);
      return { verdict: 'con_observaciones', checks_realizados: [], issues: [msg], summary: msg };
    }

    const raw = chatCompletion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('El validador no devolvió contenido');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('El validador no devolvió un JSON válido');
    }

    if (!parsed.verdict || !parsed.summary) {
      throw new Error('La respuesta del validador no tiene la forma esperada (verdict/summary)');
    }
    parsed.checks_realizados = parsed.checks_realizados || [];
    parsed.issues = parsed.issues || [];

    return parsed;
  }

  static async socraticGuidance(
    activeModule: string,
    userMessage: string,
    chatHistory: any[]
  ): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined in environment variables');
    }
    const groq = new Groq({ apiKey });

    const focus = SOCRATIC_MODULE_FOCUS[activeModule] || SOCRATIC_MODULE_FOCUS['lp'];
    const systemPrompt = `${SOCRATIC_SYSTEM_PROMPT_BASE}\n\nMódulo activo: ${activeModule}. En este módulo, tu meta es ayudar al estudiante a ${focus}`;

    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text
    }));

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: userMessage }
    ];

    let chatCompletion: any;
    try {
      chatCompletion = await groq.chat.completions.create({
        messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 500,
      });
    } catch (err) {
      if (isGroqQuotaError(err)) throw err;
      return handleGroqError(err);
    }

    return chatCompletion.choices[0]?.message?.content || "¿Puedes contarme más sobre el problema que quieres resolver?";
  }

  static async generateSocraticResponse(
    problemContext: string,
    mathematicalSolution: any,
    userMessage: string,
    chatHistory: any[]
  ): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined in environment variables');
    }

    const groq = new Groq({ apiKey });

    // RAG Search
    let ragContext = "";
    if (RagService.hasDocuments()) {
      const relevantChunks = await RagService.search(userMessage, 3);
      if (relevantChunks.length > 0) {
        ragContext = `\nContexto Adicional (Extraído de los documentos PDF del usuario):\n`;
        relevantChunks.forEach((chunk, index) => {
          ragContext += `[Fragmento ${index + 1}]: ${chunk}\n`;
        });
        ragContext += `\nInstrucción RAG: Utiliza el 'Contexto Adicional' anterior para responder la pregunta del usuario si es relevante. Si no es relevante, ignóralo.\n`;
      }
    }

    const systemPrompt = `
Eres un Consultor Ejecutivo Senior de Operaciones y Logística.
Tu objetivo es traducir la solución matemática exacta que recibes del solver en un resumen de negocio accionable para el cliente.

REGLAS CRÍTICAS DE ARQUITECTURA (Síguelas al pie de la letra o el sistema fallará):
1. NUNCA uses variables algebraicas (ej. no digas "x", "y", "x_1").
2. NUNCA muestres las ecuaciones crudas (ej. no digas "15x + 25y").
3. NUNCA uses jerga técnica de solvers (ej. prohíbido decir "precio sombra", "valor dual", "holgura", "restricción activa"). En su lugar, usa "ahorro marginal", "capacidad ociosa", "cuello de botella".
4. DEBES resolver el problema de negocio basándote en los números exactos provistos en el JSON de la Solución Matemática. No actúes como un tutor escolar. Dinos cuántos pallets fabricar, cuánto dinero se ahorra, o qué rutas usar explícitamente.
5. El tono debe ser directo, ejecutivo, profesional y orientado a la toma de decisiones.
6. ANTES de escribir, revisa uno por uno cada elemento de "variables" (o "allocations"/"result") en el JSON y anota para ti mismo el par (name, value) exacto — NUNCA le asignes a una variable el valor de otra. Si vas a mostrar un cálculo (ej. value * costo unitario), verifica la multiplicación con los números exactos del JSON antes de escribirla; no redondees ni inventes cifras de memoria.

Contexto del Problema Actual:
${problemContext}

Solución Matemática Actual (variables, función objetivo, etc.):
${JSON.stringify(mathematicalSolution, null, 2)}
${ragContext}
`;

    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text
    }));

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: userMessage }
    ];

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 800,
      });

      return chatCompletion.choices[0]?.message?.content || "Lo siento, no pude procesar tu solicitud.";
    } catch (error) {
      console.error("Error calling Groq API:", error);
      if (isGroqQuotaError(error)) throw error;
      return handleGroqError(error);
    }
  }
}
