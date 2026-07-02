import { Request, Response, NextFunction } from 'express';
import { AuditRepository } from '../repositories/audit.repository';

export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await AuditRepository.findAll();
    res.status(200).json({
      status: 'success',
      data: logs
    });
  } catch (error) {
    next(error);
  }
}
