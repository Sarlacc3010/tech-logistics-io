import { Request, Response } from "express";
import { aiTutorService } from "../services/ai-tutor.service";

export class AIController {
  async processChat(req: Request, res: Response) {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required." });
      }

      // Process the logistics problem using the Dual-LLM service
      const result = await aiTutorService.processProblem(message);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error("AIController error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const aiController = new AIController();
