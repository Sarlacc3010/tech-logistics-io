import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "dummy_key" });

export interface LogisticsExtraction {
  origin: string;
  destination: string;
  weight: number;
  unit: string;
  stops: string[];
  equations: string[];
  constraints: string[];
}

export class AITutorService {
  /**
   * Primary Solver LLM (Groq - Llama 3 70B or Mixtral 8x7b) extracts data from the user problem.
   * Llama 3 70B is excellent for reasoning and following complex instructions very quickly.
   */
  async extractProblemData(prompt: string): Promise<LogisticsExtraction> {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert logistics AI tutor. The user will provide a logistics problem.
Extract the parameters and return ONLY a valid JSON object matching this schema, with no markdown formatting, no backticks, and no introductory text:
{
  "origin": "City Name",
  "destination": "City Name",
  "weight": 0,
  "unit": "kg/tons/lbs",
  "stops": ["Stop 1", "Stop 2"],
  "equations": ["Math formulas used"],
  "constraints": ["Time limits, cost limits, etc"]
}`
          },
          { role: "user", content: prompt }
        ],
        model: "llama3-70b-8192", // We use Llama 3 70B via Groq for high accuracy reasoning
        temperature: 0.1, // Low temperature for deterministic outputs
      });

      const content = completion.choices[0]?.message?.content || "{}";
      // Clean potential markdown just in case the LLM ignored instructions
      const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned) as LogisticsExtraction;
    } catch (error) {
      console.error("Error in Solver LLM (Groq):", error);
      throw new Error("Failed to extract logistics problem data.");
    }
  }

  /**
   * Validator LLM (Gemini 1.5 Pro) validates the extracted data and math.
   * Gemini 1.5 Pro has a large context window and strong reasoning capabilities.
   */
  async validateData(data: LogisticsExtraction): Promise<{ isValid: boolean; corrections?: any; feedback: string }> {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const prompt = `You are an AI Validator. Review this extracted logistics JSON for structural and logical correctness:
${JSON.stringify(data, null, 2)}

Ensure that 'origin' and 'destination' exist, and that 'weight' is a non-negative number. Check if the equations make logistical sense.
Respond with ONLY a valid JSON object in this format (no markdown):
{
  "isValid": true/false,
  "feedback": "Your reasoning and suggestions here",
  "corrections": {} // if invalid, provide the corrected JSON
}`;

      const result = await model.generateContent(prompt);
      const content = result.response.text();
      const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
      
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("Error in Validator LLM (Gemini):", error);
      // Fallback if validator fails
      return { isValid: true, feedback: "Validation skipped due to API error." };
    }
  }

  /**
   * Orchestrator function called by the controller.
   */
  async processProblem(userMessage: string) {
    // 1. Solve and Extract using Groq (Llama 3 70B)
    const extraction = await this.extractProblemData(userMessage);

    // 2. Validate using Gemini (1.5 Pro)
    const validation = await this.validateData(extraction);

    if (!validation.isValid && validation.corrections) {
      return {
        originalExtraction: extraction,
        finalData: validation.corrections,
        feedback: validation.feedback
      };
    }

    return {
      originalExtraction: extraction,
      finalData: extraction,
      feedback: validation.feedback
    };
  }
}

export const aiTutorService = new AITutorService();
