/**
 * Middleware de auditoría: intercepta la respuesta de un endpoint del tutor
 * de IA (o del solver) para registrarla, sin que cada controller tenga que
 * hacerlo a mano. Se aplica con `auditMiddleware('tipo')` en routes/index.ts,
 * uno distinto por endpoint (ej. 'groq_tutor_interpret').
 *
 * Dos destinos según el tipo:
 * - "groq_tutor" (el Narrador, /tutor/ask): guarda en MongoDB el historial de
 *   chat completo (IAInteraction), porque ahí sí interesa la conversación
 *   completa turno a turno.
 * - Cualquier otro tipo (interpret/validate/socratic, y los solvers): guarda
 *   un registro plano en el archivo audit_logs.json vía AuditRepository —
 *   es lo que alimenta el Anexo de Interacción con IA.
 */
import { Request, Response, NextFunction } from 'express';
import { AuditRepository } from '../repositories/audit.repository';
import IAInteraction from '../models/ia-interaction.model';

export function auditMiddleware(type: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    let responseBody: any = null;

    // Intercepta res.send para poder leer el cuerpo de la respuesta antes de
    // que salga (Express no expone esto de otra forma sin un middleware).
    res.send = function (body: any): Response {
      try {
        responseBody = JSON.parse(body);
      } catch {
        responseBody = body;
      }
      return originalSend.call(this, body);
    };

    // Solo se audita si la respuesta salió bien (2xx); errores no se registran aquí.
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

          // Guardado asíncrono "fire and forget": no bloquea la respuesta al
          // cliente, solo se registra el resultado en consola.
          IAInteraction.create({
            userId,
            modelId: req.body.modelId || undefined,
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
            modelId: req.body.modelId || undefined,
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
