import { Router } from 'express';
import { solveLP } from '../controllers/linear-programming.controller';
import { askTutor } from '../controllers/tutor.controller';
import { getAuditLogs } from '../controllers/audit.controller';
import { auditMiddleware } from '../middlewares/audit.middleware';
import {
  solveTransport,
  solveNetworks,
  solveDynamic,
  solveInventories
} from '../controllers/solver.controller';
import { getModels, updateModel } from '../controllers/database.controller';

const router = Router();

// Retrieve optimization models and solutions from PostgreSQL database
router.get('/models', getModels);
router.put('/models/:id', updateModel);

// Solver endpoints (with audit logging)
router.post('/lp/solve', auditMiddleware('solver_lp'), solveLP);
router.post('/transport/solve', auditMiddleware('solver_transport'), solveTransport);
router.post('/networks/solve', auditMiddleware('solver_networks'), solveNetworks);
router.post('/dynamic/solve', auditMiddleware('solver_dynamic'), solveDynamic);
router.post('/inventories/solve', auditMiddleware('solver_inventories'), solveInventories);

// Groq AI Tutor endpoint (with audit logging)
router.post('/tutor/ask', auditMiddleware('groq_tutor'), askTutor);

// Document upload route for RAG
import uploadRoutes from './upload.routes';
router.use('/tutor', uploadRoutes);

// Audit logs retrieval
router.get('/audit/logs', getAuditLogs);

export default router;
