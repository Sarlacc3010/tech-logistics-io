import { Router } from 'express';
import { solveLP } from '../controllers/linear-programming.controller';
import { askTutor, interpretProblem, validateSolution, socraticGuidance } from '../controllers/tutor.controller';
import { getAuditLogs, getInteractionAnnex } from '../controllers/audit.controller';
import { auditMiddleware } from '../middlewares/audit.middleware';
import {
  solveTransport,
  solveNetworks,
  solveDynamic,
  solveInventories
} from '../controllers/solver.controller';
import { getModels, createModel, solveExistingModel } from '../controllers/database.controller';

const router = Router();

// Retrieve optimization models and solutions from PostgreSQL database.
// Cada resolución (chat o botón "Resolver") crea un ejercicio nuevo — no hay
// endpoint de edición in-place: la historia de ejercicios nunca se sobreescribe.
router.get('/models', getModels);
router.post('/models', createModel);
router.post('/models/:id/solve', solveExistingModel);

// Solver endpoints (with audit logging)
router.post('/lp/solve', auditMiddleware('solver_lp'), solveLP);
router.post('/transport/solve', auditMiddleware('solver_transport'), solveTransport);
router.post('/networks/solve', auditMiddleware('solver_networks'), solveNetworks);
router.post('/dynamic/solve', auditMiddleware('solver_dynamic'), solveDynamic);
router.post('/inventories/solve', auditMiddleware('solver_inventories'), solveInventories);

// Groq AI Tutor endpoints (with audit logging)
router.post('/tutor/ask', auditMiddleware('groq_tutor'), askTutor);
router.post('/tutor/interpret', auditMiddleware('groq_tutor_interpret'), interpretProblem);
router.post('/tutor/validate', auditMiddleware('groq_tutor_validate'), validateSolution);
router.post('/tutor/socratic', auditMiddleware('groq_tutor_socratic'), socraticGuidance);

// Document upload route for RAG
import uploadRoutes from './upload.routes';
router.use('/tutor', uploadRoutes);

// Audit logs retrieval
router.get('/audit/logs', getAuditLogs);
router.get('/audit/annex', getInteractionAnnex);

export default router;
