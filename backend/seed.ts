import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create dummy user
  const user = await prisma.user.create({
    data: {
      email: 'demo@tech-logistics.io',
      name: 'Demo User',
      password: 'hashed_password_here'
    }
  });

  // Create a dummy project
  const project = await prisma.project.create({
    data: {
      name: 'Global Supply Chain Q3',
      description: 'Main optimization models for Q3 operations',
      userId: user.id
    }
  });

  // 1. LP Model Data
  const lpData = {
    objective: "maximize",
    variables: [
      { name: "x1", objCoef: 5, lowBound: 0 },
      { name: "x2", objCoef: 4, lowBound: 0 },
      { name: "x3", objCoef: 3, lowBound: 0 }
    ],
    constraints: [
      { name: "Labor_Hours", operator: "<=", rhs: 240, coefficients: { "x1": 6, "x2": 4, "x3": 2 } },
      { name: "Raw_Material", operator: "<=", rhs: 270, coefficients: { "x1": 3, "x2": 2, "x3": 5 } },
      { name: "Machine_Hours", operator: "<=", rhs: 420, coefficients: { "x1": 5, "x2": 6, "x3": 5 } }
    ]
  };
  await prisma.optimizationModel.create({ data: { type: 'LP', data: lpData, projectId: project.id } });

  // 2. Transport Model Data
  const transportData = {
    origins: ["Seattle", "Dallas", "Atlanta"],
    destinations: ["Denver", "Chicago", "Miami", "New_York"],
    supply: [180, 240, 160],
    demand: [140, 160, 120, 160],
    costs: [
      [12, 18, 28, 22],
      [9, 14, 16, 24],
      [20, 11, 8, 13]
    ]
  };
  await prisma.optimizationModel.create({ data: { type: 'TRANSPORT', data: transportData, projectId: project.id } });

  // 3. Networks Model Data (Min Cost Flow)
  const networksData = {
    nodes: ["Node_1", "Node_2", "Node_3", "Node_4", "Node_5", "Node_6"],
    edges: [
      { from: "Node_1", to: "Node_3", cost: 2, capacity: 200 },
      { from: "Node_2", to: "Node_3", cost: 1, capacity: 150 },
      { from: "Node_3", to: "Node_4", cost: 3, capacity: 350 },
      { from: "Node_4", to: "Node_5", cost: 4, capacity: 170 },
      { from: "Node_4", to: "Node_6", cost: 2, capacity: 180 }
    ],
    supply_demand: {
      "Node_1": 200,
      "Node_2": 150,
      "Node_3": 0,
      "Node_4": 0,
      "Node_5": -170,
      "Node_6": -180
    }
  };
  await prisma.optimizationModel.create({ data: { type: 'NETWORKS', data: networksData, projectId: project.id } });

  // 4. Dynamic Model Data
  const dynamicData = {
    initialState: 0,
    stages: 6,
    states: [0, 50, 100, 150, 200],
    decisions: [0, 50, 100, 150, 200],
    costs: {
      "0": 0,
      "50": 10,
      "100": 20,
      "150": 30,
      "200": 40
    }
  };
  await prisma.optimizationModel.create({ data: { type: 'DYNAMIC', data: dynamicData, projectId: project.id } });

  // 5. Inventories Model Data
  const invData = {
    sku: "TL-A0041",
    demandRate: 1000,
    setupCost: 150,
    holdingCost: 2.5,
    leadTime: 7
  };
  await prisma.optimizationModel.create({ data: { type: 'INVENTORIES', data: invData, projectId: project.id } });

  console.log('Seeding completed successfully!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
