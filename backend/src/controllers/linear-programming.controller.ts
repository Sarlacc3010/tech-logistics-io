/**
 * Endpoint "directo" del solver para LP/PE (POST /api/v1/lp/solve tal como lo
 * ve el cliente): valida el body con Zod y reenvía al Solver Service. No
 * persiste nada; la persistencia real pasa por database.controller.ts.
 */
import { Request, Response, NextFunction } from 'express';
import { SolverClientService } from '../services/solver-client.service';
import { z } from 'zod';

const VariableInputSchema = z.object({
  name: z.string(),
  lowBound: z.number().nullable().optional().default(0),
  upBound: z.number().nullable().optional(),
  isInteger: z.boolean().optional().default(false), // true => Programación Entera
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
  constraints: z.array(ConstraintInputSchema),
  method: z.enum(['auto', 'simplex', 'dosfases', 'granm', 'none']).nullable().optional()
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

    // Reenvía las variables validadas, normalizando el objetivo a minúsculas
    // (el solver de Python espera "maximize"/"minimize" exactos).
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
