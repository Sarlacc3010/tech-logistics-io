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

    const mappedModels = models.map(model => {
      if (model.solutions && model.solutions.length > 0) {
        const sol = model.solutions[0];
        const extra = (sol.constraints && typeof sol.constraints === 'object' && (sol.constraints as any).rawResponse)
          ? (sol.constraints as any).rawResponse
          : {};
        return {
          ...model,
          solutions: [{
            ...sol,
            ...extra
          }]
        };
      }
      return model;
    });

    res.status(200).json({
      status: 'success',
      data: mappedModels
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
      const mappedData = {
        ...data,
        algorithm: data.algorithm ?? 'min_cost_flow',
        edges: Array.isArray(data.edges) 
          ? data.edges.map((e: any) => ({
              source: e.from ?? e.source,
              target: e.to ?? e.target,
              capacity: e.capacity,
              weight: e.cost ?? e.weight
            }))
          : []
      };
      if (data.supply_demand && !mappedData.demands) {
        mappedData.demands = data.supply_demand;
      }
      solutionResult = await SolverClientService.solveNetworks(mappedData);
    } else if (model.type === 'DYNAMIC') {
      solutionResult = await SolverClientService.solveDynamic(data);
    } else if (model.type === 'INVENTORIES') {
      let mappedData = data;
      if (!data.calc_type && (data.demandRate !== undefined || data.sku !== undefined)) {
        mappedData = {
          calc_type: 'eoq',
          parameters: {
            annual_demand: data.demandRate ?? 1000,
            setup_cost: data.setupCost ?? 150,
            holding_cost: data.holdingCost ?? 2.5,
            lead_time_days: data.leadTime ?? 7,
            sku: data.sku ?? "TL-A0041"
          }
        };
      }
      solutionResult = await SolverClientService.solveInventories(mappedData);
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
    const constraints = {
      ...(solutionResult.constraints ?? solutionResult.details ?? {}),
      rawResponse: solutionResult
    };

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

    if (finalModel && finalModel.solutions && finalModel.solutions.length > 0) {
      const sol = finalModel.solutions[0];
      const extra = (sol.constraints && typeof sol.constraints === 'object' && (sol.constraints as any).rawResponse)
        ? (sol.constraints as any).rawResponse
        : {};
      (finalModel as any).solutions = [{
        ...sol,
        ...extra
      }];
    }

    res.status(200).json({
      status: 'success',
      data: finalModel
    });
  } catch (error) {
    next(error);
  }
}
