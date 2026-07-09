import { Request, Response, NextFunction } from 'express';
import { AuditRepository } from '../repositories/audit.repository';
import IAInteraction from '../models/ia-interaction.model';

export function auditMiddleware(type: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    let responseBody: any = null;

    // Intercept response
    res.send = function (body: any): Response {
      try {
        responseBody = JSON.parse(body);
      } catch {
        responseBody = body;
      }
      return originalSend.call(this, body);
    };

    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (type === 'groq_tutor') {
          // Save to MongoDB for IA tutor audit log
          const userId = req.body.userId || 'default-user';
          const problemContext = req.body.problemContext || 'No context';
          const mathematicalSolution = req.body.mathematicalSolution || {};
          const userMessage = req.body.userMessage || '';
          const reply = responseBody?.reply || '';
          
          // Reconstruct the history that was sent, plus the new turn
          const incomingHistory = req.body.chatHistory || [];
          const updatedHistory = [
            ...incomingHistory.map((m: any) => ({
              role: m.role,
              text: m.text,
              timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
            })),
            {
              role: 'user',
              text: userMessage,
              timestamp: new Date()
            },
            {
              role: 'model',
              text: reply,
              timestamp: new Date()
            }
          ];

          IAInteraction.create({
            userId,
            problemContext,
            mathematicalSolution,
            chatHistory: updatedHistory,
            createdAt: new Date()
          }).then(() => {
            console.log('📝 IA Interaction saved to MongoDB successfully.');
          }).catch((err) => {
            console.error('❌ Failed to save IA Interaction to MongoDB:', err);
          });

        } else {
          // Save to standard JSON file audit repository (e.g. for solvers)
          AuditRepository.save({
            type,
            request: {
              body: req.body,
              query: req.query,
              params: req.params,
              url: req.originalUrl,
              method: req.method
            },
            response: responseBody
          }).then(() => {
            console.log(`📝 Log of type ${type} saved to file repository.`);
          }).catch((err) => {
            console.error('❌ Failed to save file audit log:', err);
          });
        }
      }
    });

    next();
  };
}
