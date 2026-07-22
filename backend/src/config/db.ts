/**
 * Configuración e inicialización de las dos bases de datos: PostgreSQL (vía
 * Prisma, para OptimizationModel/Solution/Project/User) y MongoDB (vía
 * Mongoose, para el historial de chat del tutor). Se conecta a ambas al
 * arrancar el servidor (ver server.ts); si alguna falla, el proceso termina
 * (son consideradas críticas, no hay modo degradado sin base de datos).
 */
import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

// Instantiate Prisma client
export const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
});

export async function connectDatabases(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const mongodbUri = process.env.MONGODB_URI;

  if (!databaseUrl) {
    console.error('❌ Database connection configuration error: DATABASE_URL env variable is missing.');
    process.exit(1);
  }

  if (!mongodbUri) {
    console.error('❌ Database connection configuration error: MONGODB_URI env variable is missing.');
    process.exit(1);
  }

  // 1. Connect to PostgreSQL via Prisma
  try {
    console.log('🔄 Connecting to PostgreSQL database via Prisma...');
    await prisma.$connect();
    console.log('✅ Connected successfully to PostgreSQL.');
  } catch (error: any) {
    console.error('❌ Failed to connect to PostgreSQL database:');
    console.error(error.message || error);
    // Graceful error handling: terminate if database is critical
    process.exit(1);
  }

  // 2. Connect to MongoDB via Mongoose
  try {
    console.log('🔄 Connecting to MongoDB database via Mongoose...');
    // Set mongoose connection options
    mongoose.set('strictQuery', true);
    await mongoose.connect(mongodbUri);
    console.log('✅ Connected successfully to MongoDB.');
  } catch (error: any) {
    console.error('❌ Failed to connect to MongoDB database:');
    console.error(error.message || error);
    // Graceful error handling: terminate if database is critical
    process.exit(1);
  }
}

// Handle application termination to close database connections gracefully
process.on('SIGINT', async () => {
  console.log('🔄 Shutting down databases connections...');
  try {
    await prisma.$disconnect();
    await mongoose.connection.close();
    console.log('✅ Database connections closed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during database connections shutdown:', err);
    process.exit(1);
  }
});
