import { Request, Response, NextFunction } from 'express';
import { SolverClientService } from '../services/solver-client.service';
import { z } from 'zod';

const VariableInputSchema = z.object({
  name: z.string(),
  lowBound: z.number().nullable().optional().default(0),
  upBound: z.number().nullable().optional(),
  isInteger: z.boolean().optional().default(false),
  objCoef: z.number()
});

const ConstraintInputSchema = z.object({
  name: z.string(),
  coefficients: z.record(z.number()),
  operator: z.enum(['<=', '>=', '=']),
  rhs: z.number()
});

const LPProblemSchema = z.object({
  objective: z.enum(['maximize', 'minimize', 'MAXIMIZE', 'MINIMIZE']),
  variables: z.array(VariableInputSchema),
  constraints: z.array(ConstraintInputSchema)
});

export async function solveLP(req: Request, res: Response, next: NextFunction) {
  try {
    const parseResult = LPProblemSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid LP model definition',
        details: parseResult.error.format()
      });
    }

    // Forward variables and format objective to lowercase
    const formattedProblem = {
      ...parseResult.data,
      objective: parseResult.data.objective.toLowerCase()
    };

    const solution = await SolverClientService.solveLP(formattedProblem);

    res.status(200).json({
      status: 'success',
      data: solution
    });
  } catch (error) {
    next(error);
  }
}
