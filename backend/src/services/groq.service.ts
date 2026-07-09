import Groq from "groq-sdk";
import { RagService } from "./rag.service";

export class GroqService {
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

    const systemPrompt = `
Eres un Consultor Ejecutivo Senior de Operaciones y Logística.

REGLAS CRÍTICAS DE ARQUITECTURA (Síguelas al pie de la letra):
1. NUNCA uses variables algebraicas crudas (ej. no digas "x_1").
2. NUNCA muestres las ecuaciones crudas (ej. no digas "15x + 25y").
3. NUNCA uses jerga técnica de solvers (ej. prohíbido decir "precio sombra" o "valor dual"). En su lugar, usa "ahorro marginal" o "capacidad ociosa".
4. El tono debe ser directo, ejecutivo, profesional y orientado a la toma de decisiones.

${isMathEmpty 
  ? "ESTADO ACTUAL: El usuario AÚN NO ha ejecutado el motor matemático (la matriz está vacía). Tu objetivo ahora es actuar como Consultor Estratégico. Usa el Contexto Adicional (RAG) para sugerirle qué modelo usar y CÓMO ESTRUCTURARLO CON SUS DATOS EXACTOS. Identifica en el documento las plantas, los centros de distribución y las capacidades, y menciónalos por su nombre en tu respuesta. NUNCA des una respuesta de libro de texto genérica; aplica la teoría a su PDF."
  : "ESTADO ACTUAL: El usuario acaba de ejecutar el motor matemático. Tu objetivo es traducir la solución numérica exacta del JSON en un resumen de negocio accionable. Dinos cuántos pallets fabricar, cuánto dinero se ahorra, o qué rutas usar explícitamente."}

Contexto del Problema (Interfaz):
${problemContext}

Solución Matemática Actual:
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
        temperature: 0.6,
        max_tokens: 800,
      });

      return chatCompletion.choices[0]?.message?.content || "Lo siento, no pude procesar tu solicitud.";
    } catch (error) {
      console.error("Error calling Groq API:", error);
      throw error;
    }
  }
}
