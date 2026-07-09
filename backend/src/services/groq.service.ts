import Groq from "groq-sdk";
import { RagService } from "./rag.service";
import { SOLVER_SOURCE_CODE } from "../constants/solverContext";

export interface TutorResponse {
  reply: string;
  action?: "UPDATE_MODEL";
  newModelData?: any;
}

const UPDATE_TOOL = {
  type: "function" as const,
  function: {
    name: "update_logistics_matrix",
    description: "Actualiza la matriz de datos del modelo logístico o de Programación Lineal activo. Usa esta herramienta SOLO cuando el usuario solicite explícitamente añadir, eliminar o modificar orígenes, destinos, costos, variables, restricciones u otros datos del modelo. NUNCA la uses para responder preguntas informativas.",
    parameters: {
      type: "object",
      properties: {
        updated_data: {
          type: "object",
          description: "El JSON completo actualizado del modelo, incluyendo TODOS los datos anteriores más las modificaciones solicitadas."
        }
      },
      required: ["updated_data"]
    }
  }
};

export class GroqService {
  static async generateSocraticResponse(
    problemContext: string,
    mathematicalSolution: any,
    userMessage: string,
    chatHistory: any[],
    currentModelData?: any,
    modelType?: string
  ): Promise<TutorResponse> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      return { reply: "La API Key de Groq no está configurada en el servidor." };
    }
    const groq = new Groq({ apiKey });

    // RAG Search
    let ragContext = "";
    if (RagService.hasDocuments()) {
      const relevantChunks = await RagService.search(userMessage, 5);
      if (relevantChunks.length > 0) {
        ragContext = `\nContexto Adicional (Extraído de los documentos PDF del usuario):\n`;
        relevantChunks.forEach((chunk, index) => {
          ragContext += `[Fragmento ${index + 1}]: ${chunk}\n`;
        });
        ragContext += `\nInstrucción RAG: Utiliza el 'Contexto Adicional' anterior para responder la pregunta del usuario. DEBES extraer y mencionar explícitamente los nombres exactos de ciudades, fábricas, capacidades o costos que aparezcan en los fragmentos para que tu respuesta sea 100% personalizada a su caso.\n`;
      }
    }

    const isMathEmpty = !mathematicalSolution || Object.keys(mathematicalSolution).length === 0;
    const hasModelData = currentModelData && Object.keys(currentModelData).length > 0;

    const systemPrompt = `
Eres un Consultor Ejecutivo Senior de Operaciones y Logística. Trabajas para una empresa real y tus respuestas deben ser prácticas, claras y orientadas a la toma de decisiones.

═══════════════════════════════════════════════
REGLAS ABSOLUTAS DE COMUNICACIÓN (Romper estas reglas es inaceptable):
═══════════════════════════════════════════════

1. PROHIBIDO usar variables algebraicas: No digas "x₁", "x_1", "x", "y", "z", "Z", "Xij". En su lugar, usa el nombre real del recurso (ej. "cantidad a enviar desde Planta Norte a Quito").
2. PROHIBIDO mostrar ecuaciones: No escribas "Min Z = 15x₁ + 25x₂", "∑", "≤", "≥", "∀", "∈". Traduce siempre a español de negocios.
3. PROHIBIDO usar jerga técnica de solvers: No digas "precio sombra", "valor dual", "holgura", "slack", "función objetivo", "restricción activa", "variable de decisión", "simplex", "branch and bound". En su lugar usa: "ahorro potencial", "capacidad sin usar", "meta de costo", "límite operativo", "ruta óptima".
4. PROHIBIDO usar nombres de algoritmos: No digas "Método de la Esquina Noroeste", "Método de Vogel", "MODI". En su lugar, di "el sistema calculó la distribución óptima".
5. OBLIGATORIO usar formato Markdown en TODAS tus respuestas:
   - Usa **negritas** para resaltar cifras clave y conclusiones.
   - Usa tablas Markdown cuando compares rutas, costos o capacidades.
   - Usa listas con viñetas para recomendaciones.
   - Usa encabezados ### para secciones importantes.
6. REGLA ANTI-ALUCINACIÓN: PROHIBIDO resolver problemas matemáticos o buscar rutas óptimas "mentalmente". No intentes aplicar Dijkstra, Simplex ni cálculos complejos por tu cuenta, ya que inventarás rutas falsas que no existen geográficamente. Si el usuario te pide calcular o resolver algo (ej. "¿cuál es la ruta más corta?"), DEBES indicarle que configure el modelo en la interfaz y presione "Resolver", para que el Motor de Python le dé la respuesta exacta. Tú solo interpretas la Solución Matemática Actual.
7. OBLIGATORIO responder en español.
8. PROHIBIDO ESCRIBIR CÓDIGO PYTHON O JSON EN EL CHAT: Si el usuario te pide configurar, crear o modificar un modelo, NUNCA escribas código Python ni bloques JSON en tu respuesta. ESTÁ TOTALMENTE PROHIBIDO. DEBES usar SIEMPRE la herramienta 'update_logistics_matrix' internamente para inyectar los datos en la interfaz.

═══════════════════════════════════════════════
REGLA DE VALIDACIÓN DE DATOS:
═══════════════════════════════════════════════

Si el usuario te pide añadir, eliminar o modificar datos del modelo:
${modelType === 'LP' ? 
  `- Para Programación Lineal: DEBES pedir las Variables de Decisión (nombre, límites inferior/superior, coeficiente de función objetivo) y las Restricciones (nombre, coeficientes por cada variable, operador <=/==/>=, y lado derecho o RHS).
  - REGLA CRÍTICA DE NOMBRES: ESTÁ ABSOLUTAMENTE PROHIBIDO usar nombres genéricos como "x1", "x2", "x3", "x", "y", "z" como nombres de variables. DEBES usar siempre el nombre real del producto o recurso (ej: "Sillas", "Mesas", "Producto_A"). Si el usuario menciona un nombre real, úsalo. Si no lo menciona, inventa un nombre descriptivo.
  - REGLA CRÍTICA DE LIMPIEZA: Cuando el usuario pida crear un NUEVO modelo, el JSON que envíes debe contener ÚNICAMENTE las variables y restricciones del nuevo modelo. BORRA completamente cualquier variable o restricción anterior. No mezcles modelos viejos con nuevos.
  - REGLA CRÍTICA: Si falta AL TÚ MENOS UN DATO (por ejemplo, el usuario olvidó el coeficiente o el lado derecho de la restricción), ESTÁ TOTALMENTE PROHIBIDO ejecutar la herramienta "update_logistics_matrix". En su lugar, responde pidiendo el dato faltante.` : 
  `- Para Modelos de Redes Logísticas: necesitas el nombre del origen/destino, capacidad de oferta/demanda, y los costos de envío.
  - REGLA CRÍTICA: Si falta AL TÚ MENOS UN DATO (por ejemplo, el usuario olvidó la demanda), ESTÁ TOTALMENTE PROHIBIDO ejecutar la herramienta "update_logistics_matrix". NO LA USES. En su lugar, responde pidiendo el dato faltante.`}
- Solo si tienes todos los datos completos y exactos, usa la herramienta "update_logistics_matrix".

${isMathEmpty
  ? "ESTADO ACTUAL: El usuario AÚN NO ha ejecutado el motor de cálculo. Tu objetivo es actuar como Consultor Estratégico. Usa el Contexto Adicional (RAG) para sugerirle qué tipo de análisis realizar y CÓMO ESTRUCTURAR SUS DATOS REALES. Identifica en el documento las plantas, centros de distribución, capacidades y costos, y menciónalos por su nombre. NUNCA des una respuesta de libro de texto genérica."
  : "ESTADO ACTUAL: El motor de cálculo acaba de ejecutarse. Tu objetivo es traducir los resultados numéricos en un REPORTE EJECUTIVO accionable. Dinos cuántas unidades enviar por cada ruta, cuánto cuesta cada una, y cuál es el ahorro total. Usa tablas Markdown obligatoriamente."}

Contexto del Problema (Interfaz):
${problemContext}

Solución Matemática Actual:
${JSON.stringify(mathematicalSolution, null, 2)}

${hasModelData ? `Datos Actuales del Modelo (usa esto como base para modificaciones):\n${JSON.stringify(currentModelData, null, 2)}` : ""}
${ragContext}

═══════════════════════════════════════════════
DOCUMENTACIÓN DEL SISTEMA (CÓDIGO FUENTE REAL)
═══════════════════════════════════════════════
Utiliza el siguiente código fuente del servidor matemático en Python para entender exactamente cómo se resuelven los problemas (con PuLP y NetworkX). Basa tus sugerencias y análisis en estos métodos exactos que el sistema tiene implementados para evitar alucinaciones:

${SOLVER_SOURCE_CODE}

!!! INSTRUCCIÓN FINAL OBLIGATORIA !!!
Si el usuario te ha pedido configurar, crear o modificar el modelo (ej. variables, restricciones), TIENES PROHIBIDO escribir la respuesta en texto. DEBES usar obligatoriamente la función 'update_logistics_matrix' haciendo una llamada a herramienta (tool call) con el JSON.
`;

    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === 'model' ? 'assistant' as const : 'user' as const,
      content: msg.text
    }));

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: userMessage }
    ];

    // Dynamic tool choice
    const isModificationRequest = /configura|añad|crea|cambi|modific|agreg|pon|haz/i.test(userMessage);
    const dynamicToolChoice = isModificationRequest 
      ? { type: "function" as const, function: { name: "update_logistics_matrix" } } 
      : "auto";

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.1-8b-instant",
        temperature: 0.1,
        max_tokens: 2000,
        tools: [UPDATE_TOOL],
        tool_choice: dynamicToolChoice,
      });

      const choice = chatCompletion.choices[0];
      const message = choice?.message;

      // Check if the LLM made a tool call
      if (message?.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        if (toolCall.function.name === "update_logistics_matrix") {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const updatedData = typeof args.updated_data === 'string' 
              ? JSON.parse(args.updated_data) 
              : args.updated_data;
            const summary = args.summary || "Datos actualizados correctamente.";

            // Build a nice reply with the summary
            const reply = message.content
              ? message.content + `\n\n✅ **Actualización aplicada:** ${summary}`
              : `✅ **Actualización aplicada:** ${summary}`;

            return {
              reply,
              action: "UPDATE_MODEL",
              newModelData: updatedData
            };
          } catch (parseErr) {
            console.error("Error parsing tool call arguments:", parseErr);
            return {
              reply: message.content || "Hubo un error al procesar la actualización de datos (el JSON fue muy grande). Por favor, intenta de nuevo."
            };
          }
        }
      }

      // Fallback: If LLM hallucinated the tool call as a JSON block in text
      let content = message?.content || "Lo siento, no pude procesar tu solicitud.";
      
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/(\{[\s\S]*\})/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          const possibleData = JSON.parse(jsonMatch[1]);
          if (possibleData.variables || possibleData.updated_data || possibleData.objective) {
            const updatedData = possibleData.updated_data 
              ? (typeof possibleData.updated_data === 'string' ? JSON.parse(possibleData.updated_data) : possibleData.updated_data) 
              : possibleData;
              
            return {
              reply: content.replace(jsonMatch[0], '') + "\n\n✅ **Actualización inyectada.**",
              action: "UPDATE_MODEL",
              newModelData: updatedData
            };
          }
        } catch (e) {
          console.error("Fallback JSON parse error", e);
        }
      }

      // Normal text response
      return {
        reply: content
      };
    } catch (groqError: any) {
      console.error("Groq API Error:", groqError);
      
      // The 8B model sometimes outputs the function call as XML-style tags instead of JSON
      // Groq rejects it with 400, but we can recover the JSON from the failed_generation field
      const failedGen = groqError?.error?.error?.failed_generation as string | undefined;
      if (failedGen) {
        // Try to extract JSON between <function=...> and </function> or <function>
        const fnMatch = failedGen.match(/<function=update_logistics_matrix>(\{[\s\S]*?\})(?:<\/function>|<function>|$)/);
        if (fnMatch && fnMatch[1]) {
          try {
            const parsedArgs = JSON.parse(fnMatch[1]);
            const updatedData = parsedArgs.updated_data 
              ? (typeof parsedArgs.updated_data === 'string' ? JSON.parse(parsedArgs.updated_data) : parsedArgs.updated_data)
              : parsedArgs;
            
            if (updatedData.variables || updatedData.objective) {
              console.log("✅ Recovered model data from failed_generation XML tag");
              return {
                reply: "✅ **Modelo configurado correctamente.** Presiona **Resolver** para obtener la solución óptima.",
                action: "UPDATE_MODEL",
                newModelData: updatedData
              };
            }
          } catch (e) {
            console.error("Failed to parse failed_generation:", e);
          }
        }
      }
      
      return {
        reply: "Tuve un problema de conexión con el servidor de Inteligencia Artificial o el análisis tomó demasiado tiempo. Por favor, intenta enviando tu mensaje nuevamente en unos segundos."
      };
    }
  }
}
