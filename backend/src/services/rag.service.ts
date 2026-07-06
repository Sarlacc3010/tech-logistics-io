import { GoogleGenerativeAI } from '@google/generative-ai';
import pdfParse from 'pdf-parse';

export class RagService {
  // Simple in-memory vector store
  private static vectorStore: { text: string; embedding: number[] }[] = [];
  
  private static getGenAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    return new GoogleGenerativeAI(apiKey);
  }

  // Chunk text into roughly 500-character segments
  private static chunkText(text: string, chunkSize = 500): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if (currentChunk.length + word.length > chunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += word + ' ';
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  }

  // Get embeddings from Gemini
  private static async getEmbedding(text: string): Promise<number[]> {
    const genAI = this.getGenAI();
    // Use the text-embedding-004 model
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }

  // Cosine similarity between two vectors
  private static cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Ingest a PDF buffer into the vector store
   */
  static async ingestPdf(pdfBuffer: Buffer): Promise<number> {
    const data = await pdfParse(pdfBuffer);
    const text = data.text;
    
    // Clear previous store for this simple demo
    this.vectorStore = [];
    
    const chunks = this.chunkText(text);
    
    // Embed chunks sequentially to avoid rate limits (or use Promise.all if high tier)
    for (const chunk of chunks) {
      try {
        const embedding = await this.getEmbedding(chunk);
        this.vectorStore.push({ text: chunk, embedding });
      } catch (err) {
        console.error("Error embedding chunk:", err);
      }
    }
    
    return chunks.length;
  }

  /**
   * Search the vector store for the most relevant chunks
   */
  static async search(query: string, topK: number = 3): Promise<string[]> {
    if (this.vectorStore.length === 0) return [];
    
    try {
      const queryEmbedding = await this.getEmbedding(query);
      
      const scoredChunks = this.vectorStore.map(item => ({
        text: item.text,
        score: this.cosineSimilarity(queryEmbedding, item.embedding)
      }));
      
      // Sort descending by score
      scoredChunks.sort((a, b) => b.score - a.score);
      
      return scoredChunks.slice(0, topK).map(item => item.text);
    } catch (err) {
      console.error("Error during RAG search:", err);
      return [];
    }
  }

  /**
   * Check if vector store has documents
   */
  static hasDocuments(): boolean {
    return this.vectorStore.length > 0;
  }
}
