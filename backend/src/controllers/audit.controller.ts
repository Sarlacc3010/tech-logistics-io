/**
 * Genera el "Anexo de Interacción con IA" que exige la rúbrica: una tabla de
 * 8 columnas (fecha, herramienta, objetivo, prompt, respuesta, análisis
 * crítico, corrección, validación) a partir de los logs de auditoría — tanto
 * el log plano en archivo (interpret/validate/socratic) como el historial
 * completo de conversación en MongoDB (ask/narrador). Se puede pedir en JSON,
 * CSV o PDF, y filtrado por un `modelId` puntual (un solo ejercicio) o para
 * todo el historial.
 */
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

// Devuelve el log de auditoría crudo (sin transformar al formato del Anexo).
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

// Recorta valores muy largos (o los serializa si no son string) para que el
// Anexo no quede ilegible con prompts/respuestas gigantes.
function truncate(value: any, max = 2000): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Une las dos fuentes de auditoría (log de archivo + MongoDB) en una sola
// lista de filas del Anexo, opcionalmente filtrada por `modelId` (un solo
// ejercicio en vez de todo el historial).
async function buildAnexoRows(modelId?: string): Promise<AnexoRow[]> {
  const fileLogs = await AuditRepository.findAll();
  const rows: AnexoRow[] = [];

  // Fuente 1: log de archivo (interpret/validate/socratic), un registro por llamada.
  for (const log of fileLogs) {
    if (!log.type.startsWith('groq_tutor')) continue;
    if (modelId && log.modelId !== modelId) continue;
    const body = log.request?.body || {};
    const response = log.response || {};

    let prompt = '';
    let respuesta = '';
    let validacion = '';

    // El prompt/respuesta relevante depende del tipo de interacción.
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
      // La validación puede haber usado Gemini (normal) o Groq (si Gemini
      // agotó su cuota); se refleja cuál fue en la columna "Herramienta".
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

  // Fuente 2: historial de conversación completo en MongoDB (endpoint /tutor/ask,
  // el "Narrador"), un registro por interacción de chat.
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

  // Más reciente primero
  return rows.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

// Serializa las filas del Anexo como CSV (para abrir en Excel).
function toCsv(rows: AnexoRow[]): string {
  const headers = ['Fecha', 'Herramienta', 'Objetivo de la consulta', 'Prompt ingresado', 'Respuesta relevante', 'Análisis crítico', 'Corrección o mejora', 'Validación'];
  const escape = (v: string) => `"${(v || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const r of rows) {
    lines.push([r.fecha, r.herramienta, r.objetivo, r.prompt, r.respuesta, r.analisis_critico, r.correccion, r.validacion].map(escape).join(','));
  }
  return lines.join('\r\n');
}

// Genera el Anexo como PDF, en formato de ficha (una interacción tras otra,
// con espacio en blanco para que el estudiante complete a mano el "análisis
// crítico" y la "corrección o mejora" que pide la rúbrica).
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
      if (doc.y > 650) doc.addPage(); // salto de página manual antes de quedarse sin espacio
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

// GET /api/audit/annex — endpoint principal. ?modelId=X filtra a un solo
// ejercicio (lo que usa el panel "Historial"); ?format=csv o ?format=pdf
// cambia el tipo de respuesta, si no se pasa devuelve JSON.
export async function getInteractionAnnex(req: Request, res: Response, next: NextFunction) {
  try {
    const modelId = typeof req.query.modelId === 'string' ? req.query.modelId : undefined;
    const rows = await buildAnexoRows(modelId);

    // Si se filtra por un ejercicio puntual, se busca su tipo/fecha para
    // ponerlos como subtítulo del PDF y como sufijo del nombre de archivo.
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
      // El BOM (﻿) al inicio hace que Excel detecte UTF-8 correctamente
      // (si no, los acentos/ñ se ven mal al abrir el CSV en Windows).
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
