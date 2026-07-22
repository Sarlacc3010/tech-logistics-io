/**
 * Endpoint para subir un PDF desde el chat (📎) y alimentar el RAG del tutor
 * (ver rag.service.ts). El archivo se recibe en memoria (no se guarda en
 * disco) y se indexa inmediatamente.
 */
import { Router } from 'express';
import multer from 'multer';
import { RagService } from '../services/rag.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const numChunks = await RagService.ingestPdf(req.file.buffer);

    res.json({ message: 'Document ingested successfully for RAG', chunks: numChunks });
  } catch (error: any) {
    console.error('Error uploading PDF:', error);
    res.status(500).json({ error: 'Failed to process PDF', details: error.message });
  }
});

export default router;
