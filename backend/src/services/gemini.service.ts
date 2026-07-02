import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

export class GeminiService {
  private static ai: GoogleGenerativeAI | null = null;

  private static getClient(): GoogleGenerativeAI {
    if (!this.ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not defined in environment variables');
      }
      this.ai = new GoogleGenerativeAI(apiKey);
    }
    return this.ai;
  }

  public static async generateSocraticResponse(
    problemContext: string,
    mathematicalSolution: any,
    userMessage: string,
    chatHistory: { role: 'user' | 'model'; text: string }[] = []
  ): Promise<string> {
    const client = this.getClient();
    
    // Choose model. gemini-1.5-flash is fast and cheap, ideal for chat.
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      }
    });

    const systemPrompt = `Eres un Arquitecto de Software Principal y profesor experto en Investigación de Operaciones actuando como un Tutor Socrático para la plataforma 'Tech-Logistics'.
Tu misión es ayudar a los estudiantes a aprender Investigación de Operaciones (Programación Lineal, Transporte, Redes, Programación Entera Mixta, Programación Dinámica e Inventarios).

INSTRUCCIONES CRÍTICAS:
1. NO des respuestas directas ni soluciones de código directo al usuario. Responde SIEMPRE en español.
2. Haz SIEMPRE preguntas orientadoras para guiar al usuario a descubrir las respuestas por sí mismo.
3. Utiliza la solución matemática y el contexto del problema provistos abajo para guiar tus preguntas, pero NO muestres los valores óptimos finales directamente a menos que el usuario los haya calculado con éxito.
4. Mantén las respuestas concisas, estructuradas y motivadoras.
5. Puedes usar markdown y viñetas.

CONTEXTO DEL PROBLEMA:
${problemContext}

SOLUCIÓN MATEMÁTICA (SOLO PARA TU REFERENCIA - NO LA REVELES DIRECTAMENTE):
${JSON.stringify(mathematicalSolution, null, 2)}
`;

    // Construct contents in Gemini API format
    const contents = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }]
      }
    ];

    // Add chat history
    for (const msg of chatHistory) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    try {
      const result = await model.generateContent({ contents });
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error('Error calling Gemini API:', error);
      throw new Error(`Gemini AI service failed: ${error.message}`);
    }
  }
}
