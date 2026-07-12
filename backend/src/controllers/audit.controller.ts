import { Request, Response, NextFunction } from 'express';
import { AuditRepository } from '../repositories/audit.repository';
import IAInteraction from '../models/ia-interaction.model';
import { prisma } from '../config/db';
import PDFDocument from 'pdfkit';

const MODULE_LABELS: Record<string, string> = {
  LP: 'Programación Lineal',
  TRANSPORT: 'Transporte',
  NETWORKS: 'Redes',
  DYNAMIC: 'Programación Dinámica',
  INVENTORIES: 'Inventarios',
};

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

const OBJETIVO_POR_TIPO: Record<string, string> = {
  groq_tutor: 'Explicación de resultados en lenguaje ejecutivo/de negocio (LLM narrador)',
  groq_tutor_interpret: 'Interpretación de enunciado en lenguaje natural y generación de parámetros del modelo (LLM Resolutor)',
  groq_tutor_validate: 'Validación matemática independiente de la solución (LLM Validador)',
  groq_tutor_socratic: 'Guía socrática — preguntas orientadoras sin resolver directamente',
};

interface AnexoRow {
  fecha: string;
  herramienta: string;
  objetivo: string;
  prompt: string;
  respuesta: string;
  analisis_critico: string;
  correccion: string;
  validacion: string;
}

function truncate(value: any, max = 2000): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

async function buildAnexoRows(modelId?: string): Promise<AnexoRow[]> {
  const fileLogs = await AuditRepository.findAll();
  const rows: AnexoRow[] = [];

  for (const log of fileLogs) {
    if (!log.type.startsWith('groq_tutor')) continue;
    if (modelId && log.modelId !== modelId) continue;
    const body = log.request?.body || {};
    const response = log.response || {};

    let prompt = '';
    let respuesta = '';
    let validacion = '';

    if (log.type === 'groq_tutor_interpret') {
      prompt = body.userMessage || '';
      respuesta = response.isNewProblem
        ? `[${response.moduleType}] ${response.explanation || ''}`
        : `(no es un problema nuevo) ${response.explanation || ''}`;
    } else if (log.type === 'groq_tutor_validate') {
      prompt = body.originalMessage || '';
      respuesta = `Veredicto: ${response.verdict || '—'}. ${response.summary || ''}`;
      validacion = `${response.verdict || '—'} — ${(response.checks_realizados || []).join(' | ')}`;
    } else if (log.type === 'groq_tutor_socratic') {
      prompt = body.userMessage || '';
      respuesta = response.reply || '';
    } else {
      prompt = body.userMessage || '';
      respuesta = response.reply || '';
    }

    let herramienta = 'Groq API — Llama 3.3 70B Versatile';
    if (log.type === 'groq_tutor_validate') {
      herramienta = response.validatedBy === 'groq_fallback'
        ? 'Groq API — Llama 3.3 70B Versatile (respaldo, Gemini no disponible)'
        : 'Google Gemini 2.5 Flash';
    }

    rows.push({
      fecha: log.timestamp,
      herramienta,
      objetivo: OBJETIVO_POR_TIPO[log.type] || log.type,
      prompt: truncate(prompt),
      respuesta: truncate(respuesta),
      analisis_critico: '',
      correccion: '',
      validacion,
    });
  }

  try {
    const mongoFilter = modelId ? { modelId } : {};
    const docs = await IAInteraction.find(mongoFilter).sort({ createdAt: -1 }).limit(500);
    for (const doc of docs) {
      const history = doc.chatHistory || [];
      const lastUser = [...history].reverse().find(m => m.role === 'user');
      const lastModel = [...history].reverse().find(m => m.role === 'model' || m.role === 'assistant');
      rows.push({
        fecha: doc.createdAt.toISOString(),
        herramienta: 'Groq API — Llama 3.3 70B Versatile',
        objetivo: OBJETIVO_POR_TIPO['groq_tutor'],
        prompt: truncate(lastUser?.text || ''),
        respuesta: truncate(lastModel?.text || ''),
        analisis_critico: '',
        correccion: '',
        validacion: '',
      });
    }
  } catch (err) {
    // MongoDB puede no estar disponible; el anexo igual se arma con los logs de archivo.
  }

  return rows.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

function toCsv(rows: AnexoRow[]): string {
  const headers = ['Fecha', 'Herramienta', 'Objetivo de la consulta', 'Prompt ingresado', 'Respuesta relevante', 'Análisis crítico', 'Corrección o mejora', 'Validación'];
  const escape = (v: string) => `"${(v || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const r of rows) {
    lines.push([r.fecha, r.herramienta, r.objetivo, r.prompt, r.respuesta, r.analisis_critico, r.correccion, r.validacion].map(escape).join(','));
  }
  return lines.join('\r\n');
}

function generatePdfBuffer(rows: AnexoRow[], subtitle?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text('Anexo de Interacción con IA Generativa', { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#666666')
      .text(`Tech-Logistics — Tutor Socrático de Investigación Operativa · Generado: ${new Date().toLocaleString('es-EC')}`, { align: 'center' });
    if (subtitle) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1345A8').text(subtitle, { align: 'center' });
    }
    doc.fillColor('#000000');
    doc.moveDown(1.2);

    if (rows.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#666666')
        .text('Este ejercicio no tiene interacciones de IA registradas (se resolvió directamente, sin pasar por el chat).', { align: 'center' });
      doc.end();
      return;
    }

    const field = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(9).text(label, { continued: false });
      doc.font('Helvetica').fontSize(9).text(value || '—');
      doc.moveDown(0.35);
    };

    rows.forEach((r, i) => {
      if (doc.y > 650) doc.addPage();
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).strokeColor('#DDDDDD').stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1345A8').text(`Interacción ${i + 1}`);
      doc.fillColor('#000000');
      doc.moveDown(0.3);

      field('Herramienta:', r.herramienta);
      field('Fecha:', new Date(r.fecha).toLocaleString('es-EC'));
      field('Objetivo de la consulta:', r.objetivo);
      field('Prompt ingresado:', r.prompt);
      field('Respuesta relevante de la IA:', r.respuesta);
      field('Validación matemática/conceptual:', r.validacion || '(pendiente — completar a mano si aplica)');
      field('Análisis crítico del grupo:', '________________________________________________');
      field('Corrección o mejora realizada:', '________________________________________________');
      doc.moveDown(0.6);
    });

    doc.end();
  });
}

export async function getInteractionAnnex(req: Request, res: Response, next: NextFunction) {
  try {
    const modelId = typeof req.query.modelId === 'string' ? req.query.modelId : undefined;
    const rows = await buildAnexoRows(modelId);

    let subtitle: string | undefined;
    let filenameSuffix = '';
    if (modelId) {
      const model = await prisma.optimizationModel.findUnique({ where: { id: modelId } });
      if (model) {
        const label = MODULE_LABELS[model.type] || model.type;
        subtitle = `Ejercicio: ${label} — ${new Date(model.createdAt).toLocaleString('es-EC')}`;
        filenameSuffix = `_${model.type.toLowerCase()}_${model.id.slice(0, 8)}`;
      }
    }

    if (req.query.format === 'csv') {
      const csv = toCsv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="anexo_interaccion_ia${filenameSuffix}.csv"`);
      return res.status(200).send('﻿' + csv);
    }

    if (req.query.format === 'pdf') {
      const buffer = await generatePdfBuffer(rows, subtitle);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="anexo_interaccion_ia${filenameSuffix}.pdf"`);
      return res.status(200).send(buffer);
    }

    res.status(200).json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    next(error);
  }
}
