import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "dummy_key" });

export class AITutorService {
  async extractProblemData(prompt: string) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert Operations Research AI tutor. Classify the user's problem into one of these modules: "lp" (Linear Programming), "transport" (Transport/Cost Matrix), "networks" (Network Flow), "inventories" (Inventory/EOQ).
Extract the parameters and return ONLY a valid JSON object with NO markdown formatting.

Format requirements based on problemType:
For "lp":
{ "problemType": "lp", "data": [ { "name": "Constraint 1", "rhsLow": 100, "rhsHigh": 200 } ] } // Simplified constraint list

For "transport":
{ "problemType": "transport", "data": [ { "origin": "City A", "destination": "City B", "cost": 10, "supply": 100, "demand": 50 } ] }

For "networks":
{ "problemType": "networks", "data": { "nodes": [ { "node": "Source A", "type": "Fuente", "flow_out": 100, "flow_in": 0 } ] } }

For "inventories":
{ "problemType": "inventories", "data": [ { "sku": "Item 1", "qty": 100, "reorder": 50, "eoq": 200, "status": "Reordenar" } ] }

Match your extraction array structure as closely as possible to these examples.`
          },
          { role: "user", content: prompt }
        ],
        model: "llama3-70b-8192",
        temperature: 0.1,
      });

      const content = completion.choices[0]?.message?.content || "{}";
      const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("Error in Solver LLM (Groq):", error);
      throw new Error("Failed to extract logistics problem data.");
    }
  }

  async validateData(extractedObject: any) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const prompt = `Review this Operations Research JSON for structural correctness and basic logical constraints (e.g. supply equals demand for transport if balanced, positive EOQ).
${JSON.stringify(extractedObject, null, 2)}

Respond with ONLY a valid JSON object in this format (no markdown):
{
  "isValid": true/false,
  "feedback": "Your reasoning here",
  "corrections": {} // provide corrected JSON if invalid
}`;

      const result = await model.generateContent(prompt);
      const content = result.response.text();
      const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
      
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("Error in Validator LLM (Gemini):", error);
      return { isValid: true, feedback: "Validation skipped." };
    }
  }

  async processProblem(userMessage: string) {
    const extraction = await this.extractProblemData(userMessage);
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
