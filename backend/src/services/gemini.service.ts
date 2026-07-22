/**
 * Cliente de la API de Google Gemini (`gemini-2.5-flash`), usado como
 * proveedor PRIMARIO del LLM #2 (Validador independiente) — es un modelo de
 * un proveedor genuinamente distinto a Groq, para que la validación no sea
 * "el mismo modelo revisándose a sí mismo". También sirve de RESPALDO para
 * los otros tres roles (interpretProblem, socraticGuidance,
 * generateSocraticResponse) si Groq agota su cuota.
 *
 * Reutiliza los mismos system prompts que groq.service.ts (importados desde
 * ahí) para que ambos proveedores se comporten igual — solo cambia qué
 * modelo ejecuta el prompt.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  VALIDATE_SYSTEM_PROMPT,
  INTERPRET_SYSTEM_PROMPT,
  SOCRATIC_SYSTEM_PROMPT_BASE,
  SOCRATIC_MODULE_FOCUS
} from './groq.service';
import { RagService } from "./rag.service";

const GEMINI_MODEL = 'gemini-2.5-flash';

/** Returns true if the error is a Gemini quota/rate-limit (429) error. */
function isQuotaError(err: any): boolean {
  const msg: string = err?.message || '';
  return (
    msg.includes('429') ||
    msg.includes('Too Many Requests') ||
    msg.includes('quota') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('rate limit')
  );
}

export class GeminiService {
  /**
   * Validador Matemático Independiente.
   * Lanza el error si es un 429/quota para que el controlador pueda hacer fallback a Groq.
   */
  static async validateSolution(
    originalMessage: string,
    moduleType: string,
    data: any,
    solvedSolution: any
  ): Promise<{ verdict: string; checks_realizados: string[]; issues: string[]; summary: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: VALIDATE_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json', // fuerza que la respuesta sea JSON parseable
      },
    });

    const userContent = `
Enunciado original del estudiante:
${originalMessage}

moduleType: ${moduleType}

Parámetros interpretados (data):
${JSON.stringify(data, null, 2)}

Solución calculada por el solver:
${JSON.stringify(solvedSolution, null, 2)}
`;

    let raw: string;
    try {
      const result = await model.generateContent(userContent);
      raw = result.response.text();
    } catch (err: any) {
      // Re-throw quota errors so the controller can fall back to Groq
      if (isQuotaError(err)) throw err;
      const msg = `El validador (Gemini) no pudo completarse: ${err?.message || 'error desconocido'}.`;
      return { verdict: 'con_observaciones', checks_realizados: [], issues: [msg], summary: msg };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('El validador (Gemini) no devolvió un JSON válido');
    }

    if (!parsed.verdict || !parsed.summary) {
      throw new Error('La respuesta del validador (Gemini) no tiene la forma esperada (verdict/summary)');
    }
    parsed.checks_realizados = parsed.checks_realizados || [];
    parsed.issues = parsed.issues || [];

    return parsed;
  }

  /**
   * Interpreta un enunciado de problema en lenguaje natural.
   * Lanza el error si es un 429/quota para que el controlador pueda hacer fallback a Groq.
   */
  static async interpretProblem(
    userMessage: string,
    currentModel?: { moduleType: string; data?: any }
  ): Promise<{ isNewProblem: boolean; moduleType: string | null; data: any; explanation: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: INTERPRET_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const userContent = currentModel
      ? `MODELO ACTUAL DEL ESTUDIANTE (módulo: ${currentModel.moduleType}):\n${JSON.stringify(currentModel.data)}\n\nMensaje del estudiante:\n${userMessage}`
      : userMessage;

    let raw: string;
    try {
      const result = await model.generateContent(userContent);
      raw = result.response.text();
    } catch (err: any) {
      // Re-throw quota errors so the controller can fall back to Groq
      if (isQuotaError(err)) throw err;
      return { isNewProblem: false, moduleType: null, data: null, explanation: `El interpretador (Gemini) falló: ${err?.message || 'error desconocido'}` };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('El interpretador (Gemini) no devolvió un JSON válido');
    }

    if (typeof parsed.isNewProblem !== 'boolean') {
      parsed.isNewProblem = Boolean(parsed.moduleType && parsed.data);
    }
    if (parsed.isNewProblem && (!parsed.moduleType || !parsed.data)) {
      throw new Error('La respuesta de Gemini no tiene la forma esperada (moduleType/data)');
    }

    return parsed;
  }

  /**
   * Guía socrática por módulo.
   * Lanza el error si es un 429/quota para que el controlador pueda hacer fallback a Groq.
   */
  static async socraticGuidance(
    activeModule: string,
    userMessage: string,
    chatHistory: any[]
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    const genAI = new GoogleGenerativeAI(apiKey);

    const focus = SOCRATIC_MODULE_FOCUS[activeModule] || SOCRATIC_MODULE_FOCUS['lp'];
    const systemPrompt = `${SOCRATIC_SYSTEM_PROMPT_BASE}\n\nMódulo activo: ${activeModule}. En este módulo, tu meta es ayudar al estudiante a ${focus}`;

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.7,
      },
    });

    // La API de Gemini usa "model" (no "assistant") para el turno del asistente.
    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    try {
      const result = await model.generateContent({
        contents: [
          ...formattedHistory,
          { role: 'user', parts: [{ text: userMessage }] }
        ]
      });
      return result.response.text() || "¿Puedes contarme más sobre el problema que quieres resolver?";
    } catch (err: any) {
      // Re-throw quota errors so the controller can fall back to Groq
      if (isQuotaError(err)) throw err;
      return `Ocurrió un error en la guía socrática (Gemini): ${err?.message || 'error desconocido'}`;
    }
  }

  /**
   * Genera una respuesta ejecutiva/socrática del tutor con contexto RAG.
   * Lanza el error si es un 429/quota para que el controlador pueda hacer fallback a Groq.
   */
  static async generateSocraticResponse(
    problemContext: string,
    mathematicalSolution: any,
    userMessage: string,
    chatHistory: any[]
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    const genAI = new GoogleGenerativeAI(apiKey);

    // Búsqueda RAG: si el usuario subió algún PDF, se agregan al prompt los
    // fragmentos más relevantes para la pregunta actual.
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

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.3,
      },
    });

    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    try {
      const result = await model.generateContent({
        contents: [
          ...formattedHistory,
          { role: 'user', parts: [{ text: userMessage }] }
        ]
      });
      return result.response.text() || "Lo siento, no pude procesar tu solicitud.";
    } catch (error: any) {
      console.error("Error calling Gemini API:", error);
      // Re-throw quota errors so the controller can fall back to Groq
      if (isQuotaError(error)) throw error;
      return `Ocurrió un error al comunicarse con Gemini: ${error?.message || 'error desconocido'}`;
    }
  }
}
