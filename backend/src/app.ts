/**
 * Configuración de la app Express: middlewares globales (CORS abierto, JSON
 * body parsing), montaje de todas las rutas bajo /api, health check, y el
 * manejador de errores centralizado al final. No arranca el servidor (eso lo
 * hace server.ts, que además conecta las bases de datos antes de escuchar).
 */
import express from 'express';
import cors from 'cors';
import router from './routes';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

// Middlewares
// CORS abierto a cualquier origen: permite acceder desde otra PC en la misma
// red (LAN) sin configuración adicional, ver README "Acceder desde otra PC".
app.use(cors({
  origin: '*', // Allow all origins for the platform
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Routes
app.use('/api', router);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Centralized error handler (debe ir al final, después de todas las rutas)
app.use(errorHandler);

export default app;
