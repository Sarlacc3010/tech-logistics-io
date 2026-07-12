import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { SolverClientService } from '../services/solver-client.service';

// Despacha al solver correcto según el tipo de modelo. Compartido entre
// createModel y solveExistingModel.
async function dispatchSolver(type: string, data: any): Promise<any> {
  if (type === 'LP') {
    const formatted = { ...data, objective: data.objective.toLowerCase() };
    return SolverClientService.solveLP(formatted);
  } else if (type === 'TRANSPORT') {
    return SolverClientService.solveTransport(data);
  } else if (type === 'NETWORKS') {
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
    return SolverClientService.solveNetworks(mappedData);
  } else if (type === 'DYNAMIC') {
    return SolverClientService.solveDynamic(data);
  } else if (type === 'INVENTORIES') {
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
    return SolverClientService.solveInventories(mappedData);
  }
  throw new Error(`Unsupported model type: ${type}`);
}

// Desempaqueta el rawResponse guardado en constraints (steps, comparisons,
// sensibilidad) de vuelta al nivel superior de la solución, para que el
// frontend reciba exactamente lo que el solver devolvió originalmente.
function unpackSolution(model: any): any {
  if (!model || !model.solutions || model.solutions.length === 0) return model;
  const sol = model.solutions[0];
  const extra = (sol.constraints && typeof sol.constraints === 'object' && (sol.constraints as any).rawResponse)
    ? (sol.constraints as any).rawResponse
    : {};
  return { ...model, solutions: [{ ...sol, ...extra }] };
}

// Crea un ejercicio NUEVO (nunca sobreescribe uno existente): cada resolución,
// sea desde el chat o desde el botón "Resolver", queda como una entrada propia
// del historial. Si se pasa `id`, se usa ese id en vez del uuid autogenerado —
// así el frontend puede generar el id ANTES de resolver y usarlo para etiquetar
// las interacciones de IA (interpretación, socrático, validación) de este mismo
// ejercicio desde el primer mensaje del chat.
// Si `solve` es false, el ejercicio se guarda sin resolver (modo socrático: no
// se le revela la solución al estudiante hasta que la pida explícitamente).
export async function createModel(req: Request, res: Response, next: NextFunction) {
  const { id, type, data, solve = true } = req.body;

  try {
    if (!type || !data) {
      return res.status(400).json({ status: 'error', message: 'type y data son requeridos' });
    }

    const project = await prisma.project.findFirst();
    if (!project) {
      return res.status(500).json({ status: 'error', message: 'No hay ningún proyecto configurado en la base de datos.' });
    }

    const model = await prisma.optimizationModel.create({
      data: { ...(id ? { id } : {}), type, data, projectId: project.id }
    });

    if (!solve) {
      const created = await prisma.optimizationModel.findUnique({
        where: { id: model.id },
        include: { solutions: true }
      });
      return res.status(201).json({ status: 'success', data: created });
    }

    const solutionResult = await dispatchSolver(type, data);

    const variables = solutionResult.variables ?? solutionResult.allocations ?? solutionResult.result?.flows ?? solutionResult.result?.decisions ?? solutionResult.decisions ?? (solutionResult.result ? [solutionResult.result] : []);
    const objectiveValue = solutionResult.objective_value ?? solutionResult.total_cost ?? solutionResult.result?.total_cost ?? solutionResult.optimal_value ?? solutionResult.objectiveValue ?? null;
    const constraints = {
      ...(solutionResult.constraints ?? solutionResult.details ?? {}),
      rawResponse: solutionResult
    };

    await prisma.solution.create({
      data: {
        status: solutionResult.status,
        objectiveValue,
        variables,
        constraints,
        modelId: model.id
      }
    });

    const finalModel = await prisma.optimizationModel.findUnique({
      where: { id: model.id },
      include: { solutions: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    res.status(201).json({ status: 'success', data: unpackSolution(finalModel) });
  } catch (error) {
    next(error);
  }
}

export async function getModels(req: Request, res: Response, next: NextFunction) {
  try {
    const models = await prisma.optimizationModel.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        solutions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    res.status(200).json({
      status: 'success',
      data: models.map(unpackSolution)
    });
  } catch (error) {
    next(error);
  }
}

// Resuelve el ejercicio ya creado con `id` y guarda su Solution. Usado cuando
// un ejercicio se creó sin resolver (modo socrático, ver createModel con
// solve=false) y luego el estudiante pide la resolución directa.
export async function solveExistingModel(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;

  try {
    const model = await prisma.optimizationModel.findUnique({ where: { id } });
    if (!model) {
      return res.status(404).json({ status: 'error', message: 'Model not found' });
    }

    const solutionResult = await dispatchSolver(model.type, model.data);

    const variables = solutionResult.variables ?? solutionResult.allocations ?? solutionResult.result?.flows ?? solutionResult.result?.decisions ?? solutionResult.decisions ?? (solutionResult.result ? [solutionResult.result] : []);
    const objectiveValue = solutionResult.objective_value ?? solutionResult.total_cost ?? solutionResult.result?.total_cost ?? solutionResult.optimal_value ?? solutionResult.objectiveValue ?? null;
    const constraints = {
      ...(solutionResult.constraints ?? solutionResult.details ?? {}),
      rawResponse: solutionResult
    };

    await prisma.solution.create({
      data: { status: solutionResult.status, objectiveValue, variables, constraints, modelId: model.id }
    });

    const finalModel = await prisma.optimizationModel.findUnique({
      where: { id },
      include: { solutions: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    res.status(200).json({ status: 'success', data: unpackSolution(finalModel) });
  } catch (error) {
    next(error);
  }
}
