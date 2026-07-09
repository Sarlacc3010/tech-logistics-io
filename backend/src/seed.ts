import { PrismaClient } from '@prisma/client';
import { SolverClientService } from './services/solver-client.service';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean existing records
  await prisma.solution.deleteMany({});
  await prisma.optimizationModel.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create default user
  const user = await prisma.user.create({
    data: {
      email: 'analista@techlogistics.com',
      name: 'Analista UCE',
      password: 'password123',
    },
  });
  console.log(`👤 Created user: ${user.email}`);

  // 3. Create project
  const project = await prisma.project.create({
    data: {
      name: 'Caso Logistico UCE',
      description: 'Modelos de Investigacion de Operaciones para la importacion y distribucion de hardware.',
      userId: user.id,
    },
  });
  console.log(`📁 Created project: ${project.name}`);

  // 4. Create Linear Programming model & solve it
  const lpData = {
    objective: 'maximize',
    variables: [
      { name: 'x1', lowBound: 0, upBound: null, isInteger: false, objCoef: 5.0 },
      { name: 'x2', lowBound: 0, upBound: 48, isInteger: false, objCoef: 4.0 },
      { name: 'x3', lowBound: 0, upBound: 12, isInteger: false, objCoef: 3.0 },
    ],
    constraints: [
      { name: 'Labor_Hours', coefficients: { x1: 6, x2: 4, x3: 2 }, operator: '<=', rhs: 240 },
      { name: 'Raw_Material', coefficients: { x1: 3, x2: 2, x3: 5 }, operator: '<=', rhs: 270 },
      { name: 'Machine_Hours', coefficients: { x1: 5, x2: 6, x3: 5 }, operator: '<=', rhs: 420 },
    ],
  };

  const lpModel = await prisma.optimizationModel.create({
    data: {
      type: 'LP',
      data: lpData,
      projectId: project.id,
    },
  });

  try {
    const lpSol = await SolverClientService.solveLP(lpData);
    await prisma.solution.create({
      data: {
        status: lpSol.status,
        objectiveValue: lpSol.objective_value,
        variables: lpSol.variables,
        constraints: lpSol.constraints,
        modelId: lpModel.id,
      },
    });
    console.log('✅ Seeded LP model and solution.');
  } catch (err: any) {
    console.error('⚠️ Failed to solve/seed LP:', err.message);
  }

  // 5. Create Transportation model & solve it
  const transportData = {
    origins: ['Quito_Norte', 'Guayaquil_Sur', 'Cuenca_Central'],
    destinations: ['Manta_D1', 'Loja_D2', 'Machala_D3', 'Ambato_D4'],
    supply: [180.0, 240.0, 160.0],
    demand: [140.0, 160.0, 120.0, 160.0],
    costs: [
      [12.0, 18.0, 28.0, 22.0],
      [9.0, 14.0, 16.0, 24.0],
      [20.0, 11.0, 8.0, 13.0],
    ],
  };

  const transportModel = await prisma.optimizationModel.create({
    data: {
      type: 'TRANSPORT',
      data: transportData,
      projectId: project.id,
    },
  });

  try {
    const transportSol = await SolverClientService.solveTransport(transportData);
    await prisma.solution.create({
      data: {
        status: transportSol.status,
        objectiveValue: transportSol.total_cost,
        variables: transportSol.allocations,
        constraints: {},
        modelId: transportModel.id,
      },
    });
    console.log('✅ Seeded Transport model and solution.');
  } catch (err: any) {
    console.error('⚠️ Failed to solve/seed Transport:', err.message);
  }

  // 6. Create Networks model & solve it (Min Cost Flow)
  const networksData = {
    algorithm: 'min_cost_flow',
    nodes: ['Node_1', 'Node_2', 'Node_3', 'Node_4', 'Node_5', 'Node_6'],
    edges: [
      { source: 'Node_1', target: 'Node_3', capacity: 200, weight: 10 },
      { source: 'Node_2', target: 'Node_3', capacity: 150, weight: 12 },
      { source: 'Node_3', target: 'Node_4', capacity: 180, weight: 8 },
      { source: 'Node_3', target: 'Node_5', capacity: 200, weight: 15 },
      { source: 'Node_4', target: 'Node_5', capacity: 170, weight: 7 },
      { source: 'Node_4', target: 'Node_6', capacity: 180, weight: 11 },
    ],
    source_node: null,
    target_node: null,
    demands: {
      Node_1: -200,
      Node_2: -150,
      Node_5: 170,
      Node_6: 180,
    },
  };

  const networksModel = await prisma.optimizationModel.create({
    data: {
      type: 'NETWORKS',
      data: networksData,
      projectId: project.id,
    },
  });

  try {
    const networksSol = await SolverClientService.solveNetworks(networksData);
    await prisma.solution.create({
      data: {
        status: networksSol.status,
        objectiveValue: networksSol.result.total_cost,
        variables: networksSol.result.flows,
        constraints: {},
        modelId: networksModel.id,
      },
    });
    console.log('✅ Seeded Networks model and solution.');
  } catch (err: any) {
    console.error('⚠️ Failed to solve/seed Networks:', err.message);
  }

  // 7. Create Dynamic Programming model & solve it (Lot Sizing)
  const dynamicData = {
    problem_type: 'lot_sizing',
    parameters: {
      demands: [100.0, 120.0, 80.0, 130.0, 90.0, 110.0],
      setup_cost: 200.0,
      holding_cost: 2.0,
    },
  };

  const dynamicModel = await prisma.optimizationModel.create({
    data: {
      type: 'DYNAMIC',
      data: dynamicData,
      projectId: project.id,
    },
  });

  try {
    const dynamicSol = await SolverClientService.solveDynamic(dynamicData);
    await prisma.solution.create({
      data: {
        status: dynamicSol.status,
        objectiveValue: dynamicSol.optimal_value,
        variables: dynamicSol.decisions,
        constraints: dynamicSol.details || {},
        modelId: dynamicModel.id,
      },
    });
    console.log('✅ Seeded Dynamic programming model and solution.');
  } catch (err: any) {
    console.error('⚠️ Failed to solve/seed Dynamic:', err.message);
  }

  // 8. Create Inventory model & solve it (EOQ)
  const inventoryData = {
    calc_type: 'eoq',
    parameters: {
      annual_demand: 10000.0,
      setup_cost: 50.0,
      holding_cost: 5.0,
      lead_time_days: 7.0,
      service_level_z: 1.65,
      demand_std_dev: 10.0,
    },
  };

  const inventoriesModel = await prisma.optimizationModel.create({
    data: {
      type: 'INVENTORIES',
      data: inventoryData,
      projectId: project.id,
    },
  });

  try {
    const inventoriesSol = await SolverClientService.solveInventories(inventoryData);
    await prisma.solution.create({
      data: {
        status: inventoriesSol.status,
        objectiveValue: inventoriesSol.result.total_cost,
        variables: [inventoriesSol.result],
        constraints: {},
        modelId: inventoriesModel.id,
      },
    });
    console.log('✅ Seeded Inventories model and solution.');
  } catch (err: any) {
    console.error('⚠️ Failed to solve/seed Inventories:', err.message);
  }

  console.log('🌱 Seeding process complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
