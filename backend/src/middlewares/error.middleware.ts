/**
 * Manejador de errores centralizado de Express (se registra al final de la
 * cadena de middlewares en app.ts). Cualquier `next(error)` de un controller
 * termina aquí en vez de tumbar el proceso.
 */
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error handling request:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    details: err.details || null
  });
}
