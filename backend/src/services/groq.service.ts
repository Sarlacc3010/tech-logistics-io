import Groq from "groq-sdk";
import { RagService } from "./rag.service";

export interface TutorResponse {
  reply: string;
  action?: "UPDATE_MODEL";
  newModelData?: any;
}

const UPDATE_TOOL = {
  type: "function" as const,
  function: {
    name: "update_logistics_matrix",
    description: "Actualiza la matriz de datos del modelo logístico activo. Usa esta herramienta SOLO cuando el usuario solicite explícitamente añadir, eliminar o modificar orígenes, destinos, costos, capacidades u otros datos del modelo. NUNCA la uses para responder preguntas informativas.",
    parameters: {
      type: "object",
      properties: {
        updated_data: {
          type: "string",
          description: "El JSON completo actualizado del modelo, incluyendo TODOS los datos anteriores más las modificaciones solicitadas. Debe ser un JSON válido y parseable."
        },
        summary: {
          type: "string",
          description: "Un breve resumen en español de los cambios realizados al modelo, en lenguaje de negocios."
        }
      },
      required: ["updated_data", "summary"]
    }
  }
};

export class GroqService {
  static async generateSocraticResponse(
    problemContext: string,
    mathematicalSolution: any,
    userMessage: string,
    chatHistory: any[],
    currentModelData?: any
  ): Promise<TutorResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined in environment variables');
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
6. OBLIGATORIO responder en español.

═══════════════════════════════════════════════
REGLA DE VALIDACIÓN DE DATOS:
═══════════════════════════════════════════════

Si el usuario te pide añadir, eliminar o modificar datos del modelo (orígenes, destinos, costos, capacidades):
- Primero verifica que te ha dado TODA la información necesaria.
- Para un nuevo origen: necesitas su nombre y su capacidad de oferta, y los costos de envío hacia CADA destino existente.
- Para un nuevo destino: necesitas su nombre y su demanda, y los costos de envío desde CADA origen existente.
- REGLA CRÍTICA: Si falta AL TÚ MENOS UN DATO (por ejemplo, el usuario olvidó la demanda), ESTÁ TOTALMENTE PROHIBIDO ejecutar la herramienta "update_logistics_matrix". NO LA USES. En su lugar, responde pidiendo el dato faltante.
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

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.1-8b-instant",
        temperature: 0.5,
        max_tokens: 4000,
        tools: hasModelData ? [UPDATE_TOOL] : undefined,
        tool_choice: hasModelData ? "auto" : undefined,
      });

      const choice = chatCompletion.choices[0];
      const message = choice?.message;

      // Check if the LLM made a tool call
      if (message?.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        if (toolCall.function.name === "update_logistics_matrix") {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const updatedData = JSON.parse(args.updated_data);
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

      // Normal text response (no tool call)
      return {
        reply: message?.content || "Lo siento, no pude procesar tu solicitud."
      };
    } catch (groqError: any) {
      console.error("Groq API Error:", groqError);
      return {
        reply: "Tuve un problema de conexión con el servidor de Inteligencia Artificial o el análisis tomó demasiado tiempo. Por favor, intenta enviando tu mensaje nuevamente en unos segundos."
      };
    }
  }
}
