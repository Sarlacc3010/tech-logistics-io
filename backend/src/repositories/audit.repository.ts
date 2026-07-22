/**
 * Log de auditoría plano, guardado como un array JSON en un archivo dentro
 * del contenedor del backend (audit_logs.json). Registra las llamadas a
 * interpret/validate/socratic y a los solvers directos (no el chat completo
 * del Narrador, eso va a MongoDB — ver ia-interaction.model.ts). Es lo que
 * lee audit.controller.ts para armar el Anexo de Interacción con IA.
 *
 * Limitación conocida: al no tener volumen montado en docker-compose.yml,
 * este archivo se reinicia cada vez que se reconstruye el contenedor.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface AuditLog {
  id: string;
  timestamp: string;
  type: string;
  modelId?: string;
  request: any;
  response: any;
}

export class AuditRepository {
  private static filePath = path.join(process.cwd(), 'audit_logs.json');

  // Lee todo el archivo y lo parsea; si no existe, lo crea vacío.
  private static readLogs(): AuditLog[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
        return [];
      }
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read audit logs:', error);
      return [];
    }
  }

  // Reescribe el archivo completo (no hay append incremental: se lee todo,
  // se modifica en memoria, se vuelve a escribir todo).
  private static writeLogs(logs: AuditLog[]): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to write audit logs:', error);
    }
  }

  public static async save(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    const logs = this.readLogs();
    const newLog: AuditLog = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
      ...log
    };
    logs.push(newLog);
    this.writeLogs(logs);
    return newLog;
  }

  public static async findAll(): Promise<AuditLog[]> {
    return this.readLogs();
  }
}
