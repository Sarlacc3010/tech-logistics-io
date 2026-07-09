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
      const { origins, destinations, supply, demand, costs } = data;
      if (!origins || !destinations || !supply || !demand || !costs) {
        return res.status(400).json({ status: 'error', message: 'Faltan datos requeridos (origins, destinations, supply, demand, costs).' });
      }
      if (supply.length !== costs.length) {
        return res.status(400).json({ status: 'error', message: `Las filas de la matriz de costos (${costs.length}) no coinciden con la cantidad de orígenes/oferta (${supply.length}).` });
      }
      if (costs.length > 0 && demand.length !== costs[0].length) {
        return res.status(400).json({ status: 'error', message: `Las columnas de la matriz de costos (${costs[0].length}) no coinciden con la cantidad de destinos/demanda (${demand.length}). Verifica que todos los datos estén completos.` });
      }
      solutionResult = await SolverClientService.solveTransport(data);
    } else if (model.type === 'NETWORKS') {
      const { nodes, edges, algorithm, source_node, target_node } = data;
      if (!nodes || !edges) {
        return res.status(400).json({ status: 'error', message: 'Faltan datos requeridos (nodes, edges).' });
      }
      if (algorithm === 'shortest_path' || algorithm === 'max_flow') {
        if (!source_node || !target_node) {
          return res.status(400).json({ status: 'error', message: `El algoritmo ${algorithm} requiere que se especifique un Origen Padre (source_node) y un Destino Padre (target_node).` });
        }
        if (!nodes.includes(source_node) || !nodes.includes(target_node)) {
          return res.status(400).json({ status: 'error', message: `El origen o destino padre no existen en la lista de nodos.` });
        }
      } else if (algorithm === 'min_cost_flow') {
        const demands = data.demands;
        if (!demands) {
          return res.status(400).json({ status: 'error', message: 'Faltan datos requeridos para min_cost_flow (demands).' });
        }
        const totalDemand = Object.values(demands).reduce((acc: number, val: any) => acc + Number(val), 0);
        if (totalDemand !== 0) {
          return res.status(400).json({ status: 'error', message: `El modelo está desbalanceado. La suma de oferta y demanda debe ser 0, pero la diferencia neta es ${totalDemand}. Revisa los datos de los nodos.` });
        }
      }
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

    const variables = solutionResult.variables ?? solutionResult.allocations ?? solutionResult.result?.path ?? solutionResult.result?.flows ?? solutionResult.result?.decisions ?? solutionResult.decisions ?? (solutionResult.result ? [solutionResult.result] : []);
    const objectiveValue = solutionResult.objective_value ?? solutionResult.total_cost ?? solutionResult.result?.cost ?? solutionResult.result?.total_flow ?? solutionResult.result?.total_cost ?? solutionResult.optimal_value ?? solutionResult.objectiveValue ?? null;
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
  } catch (error: any) {
    if (error.response && error.response.data) {
      // Forward the error from the Python solver
      return res.status(error.response.status).json({ 
        status: 'error', 
        message: error.response.data.detail || error.response.data.message || 'Error en el motor matemático' 
      });
    }
    next(error);
  }
}
