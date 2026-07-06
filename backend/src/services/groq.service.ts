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
