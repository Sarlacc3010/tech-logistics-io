import app from './app';
import { connectDatabases } from './config/db';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 4000;

async function startServer() {
  // Connect to databases first
  await connectDatabases();

  app.listen(PORT, () => {
    console.log(`Tech-Logistics Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

