import { Request, Response, NextFunction } from 'express';
import { GroqService } from '../services/groq.service';
import { z } from 'zod';

const TutorRequestSchema = z.object({
  problemContext: z.string(),
  mathematicalSolution: z.any().optional(),
  userMessage: z.string(),
  chatHistory: z.array(
    z.object({
      role: z.enum(['user', 'model', 'assistant']),
      text: z.string()
    })
  ).optional()
});

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

    const reply = await GroqService.generateSocraticResponse(
      problemContext,
      mathematicalSolution || {},
      userMessage,
      chatHistory || []
    );

    res.status(200).json({
      status: 'success',
      reply
    });
  } catch (error) {
    next(error);
  }
}
