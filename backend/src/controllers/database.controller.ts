import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { SolverClientService } from '../services/solver-client.service';

export async function getModels(req: Request, res: Response, next: NextFunction) {
  try {
    const models = await prisma.optimizationModel.findMany({
      include: {
        solutions: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    });
    res.status(200).json({
      status: 'success',
      data: models
    });
  } catch (error) {
    next(error);
  }
}

export async function updateModel(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;
  const { data } = req.body;

  try {
    const model = await prisma.optimizationModel.findUnique({
      where: { id }
    });

    if (!model) {
      return res.status(404).json({
        status: 'error',
        message: 'Model not found'
      });
    }

    let solutionResult: any;
    if (model.type === 'LP') {
      const formatted = { ...data, objective: data.objective.toLowerCase() };
      solutionResult = await SolverClientService.solveLP(formatted);
    } else if (model.type === 'TRANSPORT') {
      solutionResult = await SolverClientService.solveTransport(data);
    } else if (model.type === 'NETWORKS') {
      solutionResult = await SolverClientService.solveNetworks(data);
    } else if (model.type === 'DYNAMIC') {
      solutionResult = await SolverClientService.solveDynamic(data);
    } else if (model.type === 'INVENTORIES') {
      solutionResult = await SolverClientService.solveInventories(data);
    } else {
      throw new Error(`Unsupported model type: ${model.type}`);
    }

    const updatedModel = await prisma.optimizationModel.update({
      where: { id },
      data: { data },
      include: { solutions: true }
    });

    const variables = solutionResult.variables ?? solutionResult.allocations ?? solutionResult.result?.flows ?? solutionResult.result?.decisions ?? solutionResult.decisions ?? (solutionResult.result ? [solutionResult.result] : []);
    const objectiveValue = solutionResult.objective_value ?? solutionResult.total_cost ?? solutionResult.result?.total_cost ?? solutionResult.optimal_value ?? solutionResult.objectiveValue ?? null;
    const constraints = solutionResult.constraints ?? solutionResult.details ?? {};

    const existingSolution = updatedModel.solutions[0];
    if (existingSolution) {
      await prisma.solution.update({
        where: { id: existingSolution.id },
        data: {
          status: solutionResult.status,
          objectiveValue,
          variables,
          constraints
        }
      });
    } else {
      await prisma.solution.create({
        data: {
          status: solutionResult.status,
          objectiveValue,
          variables,
          constraints,
          modelId: model.id
        }
      });
    }

    const finalModel = await prisma.optimizationModel.findUnique({
      where: { id },
      include: {
        solutions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    res.status(200).json({
      status: 'success',
      data: finalModel
    });
  } catch (error) {
    next(error);
  }
}
