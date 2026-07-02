import * as fs from 'fs';
import * as path from 'path';

export interface AuditLog {
  id: string;
  timestamp: string;
  type: string;
  request: any;
  response: any;
}

export class AuditRepository {
  private static filePath = path.join(process.cwd(), 'audit_logs.json');

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
