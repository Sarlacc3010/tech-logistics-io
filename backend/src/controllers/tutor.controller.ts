import { Request, Response, NextFunction } from 'express';
import { GroqService } from '../services/groq.service';
import { z } from 'zod';

const InterpretRequestSchema = z.object({
  userMessage: z.string().min(1)
});

const ValidateRequestSchema = z.object({
  originalMessage: z.string(),
  moduleType: z.string(),
  data: z.any(),
  solvedSolution: z.any()
});

const SocraticRequestSchema = z.object({
  activeModule: z.string(),
  userMessage: z.string(),
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
  chatHistory: z.array(
    z.object({
      role: z.enum(['user', 'model', 'assistant']),
      text: z.string()
    })
  ).optional()
});

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

    const { isNewProblem, moduleType, data, explanation } = await GroqService.interpretProblem(parseResult.data.userMessage);

    res.status(200).json({
      status: 'success',
      isNewProblem,
      moduleType,
      data,
      explanation
    });
  } catch (error) {
    next(error);
  }
}

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
    const result = await GroqService.validateSolution(originalMessage, moduleType, data, solvedSolution);

    res.status(200).json({
      status: 'success',
      ...result
    });
  } catch (error) {
    next(error);
  }
}

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
    const reply = await GroqService.socraticGuidance(activeModule, userMessage, chatHistory || []);

    res.status(200).json({
      status: 'success',
      reply
    });
  } catch (error) {
    next(error);
  }
}

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
