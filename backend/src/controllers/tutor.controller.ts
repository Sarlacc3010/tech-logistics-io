/**
 * Controllers del Tutor de IA multi-LLM: interpretación de enunciados,
 * validación independiente, modo socrático y explicación de resultados.
 *
 * Patrón compartido en los 4 endpoints: se intenta primero con un proveedor
 * (Groq o Gemini según el rol) y, si ese proveedor devuelve un error de cuota
 * (HTTP 429), se reintenta automáticamente con el otro proveedor antes de
 * fallar — así el estudiante nunca se queda sin respuesta solo porque un LLM
 * agotó su límite gratuito.
 */
import { Request, Response, NextFunction } from 'express';
import { GroqService } from '../services/groq.service';
import { GeminiService } from '../services/gemini.service';
import { z } from 'zod';

// modelId: id del ejercicio (OptimizationModel) al que pertenece esta
// interacción — lo usa auditMiddleware (lee req.body directo, no el objeto
// parseado por Zod) para poder generar después el Anexo IA de un ejercicio
// puntual. Es opcional porque la primerísima llamada de interpretación de un
// problema nuevo puede no tener todavía un ejercicio creado en Postgres.
const InterpretRequestSchema = z.object({
  userMessage: z.string().min(1),
  modelId: z.string().optional(),
  // Modelo activo del módulo actual, para que el LLM pueda detectar ediciones
  // incrementales ("agrega también este origen") en vez de tratar el mensaje
  // siempre como un problema nuevo desde cero.
  currentModel: z.object({
    moduleType: z.string(),
    data: z.any()
  }).optional()
});

const ValidateRequestSchema = z.object({
  originalMessage: z.string(),
  moduleType: z.string(),
  data: z.any(),
  solvedSolution: z.any(),
  modelId: z.string().optional()
});

const SocraticRequestSchema = z.object({
  activeModule: z.string(),
  userMessage: z.string(),
  modelId: z.string().optional(),
  chatHistory: z.array(
    z.object({
      role: z.enum(['user', 'model', 'assistant']),
      text: z.string()
    })
  ).optional()
});

const TutorRequestSchema = z.object({
  problemContext: z.string(),
  mathematicalSolution: z.any().optional(),
  userMessage: z.string(),
  modelId: z.string().optional(),
  chatHistory: z.array(
    z.object({
      role: z.enum(['user', 'model', 'assistant']),
      text: z.string()
    })
  ).optional()
});

// ─── Interpret Problem ────────────────────────────────────────────────────────
// LLM #1 (Resolutor): recibe el enunciado en lenguaje natural y devuelve
// {isNewProblem, moduleType, data} — decide a cuál de los 6 módulos pertenece
// y construye el JSON de parámetros exacto que ese módulo espera.
// Groq (Resolutor) es el primario: así no se consume la cuota diaria gratuita
// de Gemini en cada mensaje del chat. Si Groq alcanza SU propio rate limit
// (429), se hace fallback a Gemini para no dejar al usuario sin respuesta.
export async function interpretProblem(req: Request, res: Response, next: NextFunction) {
  try {
    const parseResult = InterpretRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request body',
        details: parseResult.error.format()
      });
    }

    let result;
    try {
      result = await GroqService.interpretProblem(parseResult.data.userMessage, parseResult.data.currentModel);
    } catch (groqError) {
      console.error('Groq interpretProblem alcanzó su límite, usando Gemini como respaldo:', groqError);
      result = await GeminiService.interpretProblem(parseResult.data.userMessage, parseResult.data.currentModel);
    }

    const { isNewProblem, moduleType, data, explanation } = result;
    res.status(200).json({ status: 'success', isNewProblem, moduleType, data, explanation });
  } catch (error) {
    next(error);
  }
}

// ─── Validate Solution ────────────────────────────────────────────────────────
// LLM #2 (Validador independiente): recalcula la aritmética por su cuenta a
// partir del enunciado original y del resultado obtenido, y emite un veredicto
// (válido/con observaciones/inválido). Es el proveedor "contrario" al de la
// interpretación (Gemini primero, Groq de respaldo) para que la validación sea
// genuinamente independiente, no el mismo modelo revisándose a sí mismo.
export async function validateSolution(req: Request, res: Response, next: NextFunction) {
  try {
    const parseResult = ValidateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request body',
        details: parseResult.error.format()
      });
    }

    const { originalMessage, moduleType, data, solvedSolution } = parseResult.data;

    let result;
    let validatedBy = 'gemini';
    try {
      result = await GeminiService.validateSolution(originalMessage, moduleType, data, solvedSolution);
    } catch (geminiError) {
      console.error('Gemini validateSolution quota/error, falling back to Groq:', geminiError);
      validatedBy = 'groq_fallback';
      result = await GroqService.validateSolution(originalMessage, moduleType, data, solvedSolution);
    }

    // validatedBy viaja en la respuesta para que el Anexo IA pueda mostrar qué
    // proveedor validó realmente cada interacción (útil si hubo fallback).
    res.status(200).json({ status: 'success', validatedBy, ...result });
  } catch (error) {
    next(error);
  }
}

// ─── Socratic Guidance ────────────────────────────────────────────────────────
// Modo socrático: en vez de resolver, hace 1-3 preguntas orientadoras por
// turno para que el estudiante construya el modelo (variables, función
// objetivo, restricciones) por sí mismo, sin revelar el resultado.
// Groq (Tutor Socrático) es el primario: esta ruta se llama en cada turno del
// chat, así que usar Gemini aquí por defecto agotaría su cuota diaria gratuita
// en minutos. Si Groq alcanza SU propio rate limit (429), se hace fallback a
// Gemini para no dejar al estudiante sin respuesta.
export async function socraticGuidance(req: Request, res: Response, next: NextFunction) {
  try {
    const parseResult = SocraticRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request body',
        details: parseResult.error.format()
      });
    }

    const { activeModule, userMessage, chatHistory } = parseResult.data;

    let reply: string;
    try {
      reply = await GroqService.socraticGuidance(activeModule, userMessage, chatHistory || []);
    } catch (groqError) {
      console.error('Groq socraticGuidance alcanzó su límite, usando Gemini como respaldo:', groqError);
      reply = await GeminiService.socraticGuidance(activeModule, userMessage, chatHistory || []);
    }

    res.status(200).json({ status: 'success', reply });
  } catch (error) {
    next(error);
  }
}

// ─── Ask Tutor ────────────────────────────────────────────────────────────────
// LLM #3 (Narrador): traduce una solución ya resuelta a lenguaje de negocio, o
// responde preguntas de seguimiento del estudiante sobre esa solución.
// Groq (Narrador/Tutor Ejecutivo) es el primario, igual que socraticGuidance.
// Si Groq alcanza SU propio rate limit (429), se hace fallback a Gemini.
export async function askTutor(req: Request, res: Response, next: NextFunction) {
  try {
    const parseResult = TutorRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request body',
        details: parseResult.error.format()
      });
    }

    const { problemContext, mathematicalSolution, userMessage, chatHistory } = parseResult.data;

    let reply: string;
    try {
      reply = await GroqService.generateSocraticResponse(
        problemContext,
        mathematicalSolution || {},
        userMessage,
        chatHistory || []
      );
    } catch (groqError) {
      console.error('Groq generateSocraticResponse alcanzó su límite, usando Gemini como respaldo:', groqError);
      reply = await GeminiService.generateSocraticResponse(
        problemContext,
        mathematicalSolution || {},
        userMessage,
        chatHistory || []
      );
    }

    res.status(200).json({ status: 'success', reply });
  } catch (error) {
    next(error);
  }
}
