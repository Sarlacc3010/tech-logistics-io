import { Request, Response, NextFunction } from 'express';
import { SolverClientService } from '../services/solver-client.service';
import { z } from 'zod';

// Zod schemas for validation
const TransportProblemSchema = z.object({
  origins: z.array(z.string()),
  destinations: z.array(z.string()),
  supply: z.array(z.number()),
  demand: z.array(z.number()),
  costs: z.array(z.array(z.number())),
  initial_method: z.enum(['noroeste', 'costo_minimo', 'vogel']).nullable().optional()
});

const EdgeInputSchema = z.object({
  source: z.string(),
  target: z.string(),
  capacity: z.number().nullable().optional(),
  weight: z.number().nullable().optional()
});

const NetworkProblemSchema = z.object({
  algorithm: z.enum(['shortest_path', 'max_flow', 'min_cost_flow', 'min_spanning_tree']),
  nodes: z.array(z.string()),
  edges: z.array(EdgeInputSchema),
  source_node: z.string().nullable().optional(),
  target_node: z.string().nullable().optional(),
  demands: z.record(z.number()).nullable().optional()
});

const DPProblemSchema = z.object({
  problem_type: z.enum(['knapsack', 'lot_sizing']),
  parameters: z.record(z.any())
});

const InventoryProblemSchema = z.object({
  calc_type: z.enum(['eoq', 'abc', 'eoq_discounts', 'eoq_backorders', 'epq', 'reorder_point']),
  parameters: z.record(z.any())
});

export async function solveTransport(req: Request, res: Response, next: NextFunction) {
  try {
    const parseResult = TransportProblemSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Transport model definition',
        details: parseResult.error.format()
      });
    }

    const solution = await SolverClientService.solveTransport(parseResult.data);
    res.status(200).json({
      status: 'success',
      data: solution
    });
  } catch (error) {
    next(error);
  }
}

export async function solveNetworks(req: Request, res: Response, next: NextFunction) {
  try {
    const mappedBody = {
      ...req.body,
      algorithm: req.body.algorithm ?? 'min_cost_flow',
      edges: Array.isArray(req.body.edges) 
        ? req.body.edges.map((e: any) => ({
            source: e.from ?? e.source,
            target: e.to ?? e.target,
            capacity: e.capacity,
            weight: e.cost ?? e.weight
          }))
        : []
    };
    if (req.body.supply_demand && !mappedBody.demands) {
      mappedBody.demands = req.body.supply_demand;
    }

    const parseResult = NetworkProblemSchema.safeParse(mappedBody);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Network model definition',
        details: parseResult.error.format()
      });
    }

    const solution = await SolverClientService.solveNetworks(parseResult.data);
    res.status(200).json({
      status: 'success',
      data: solution
    });
  } catch (error) {
    next(error);
  }
}

export async function solveDynamic(req: Request, res: Response, next: NextFunction) {
  try {
    const parseResult = DPProblemSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Dynamic Programming model definition',
        details: parseResult.error.format()
      });
    }

    const solution = await SolverClientService.solveDynamic(parseResult.data);
    res.status(200).json({
      status: 'success',
      data: solution
    });
  } catch (error) {
    next(error);
  }
}

export async function solveInventories(req: Request, res: Response, next: NextFunction) {
  try {
    let mappedBody = req.body;
    if (!req.body.calc_type && (req.body.demandRate !== undefined || req.body.sku !== undefined)) {
      mappedBody = {
        calc_type: 'eoq',
        parameters: {
          annual_demand: req.body.demandRate ?? 1000,
          setup_cost: req.body.setupCost ?? 150,
          holding_cost: req.body.holdingCost ?? 2.5,
          lead_time_days: req.body.leadTime ?? 7,
          sku: req.body.sku ?? "TL-A0041"
        }
      };
    }

    const parseResult = InventoryProblemSchema.safeParse(mappedBody);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Inventory model definition',
        details: parseResult.error.format()
      });
    }

    const solution = await SolverClientService.solveInventories(parseResult.data);
    res.status(200).json({
      status: 'success',
      data: solution
    });
  } catch (error) {
    next(error);
  }
}
