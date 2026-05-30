/**
 * Application Configuration
 *
 * Loads environment variables from .env and exposes a single config object
 * used across all backend services. Defaults are provided for local development.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 3001,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "llama3.2",
  embeddingModel: process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
  topK: Number(process.env.TOP_K) || 4,
  chunkSize: Number(process.env.CHUNK_SIZE) || 250,
  chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 50,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  chromaHost: process.env.CHROMA_HOST || "localhost",
  chromaPort: Number(process.env.CHROMA_PORT) || 8000,
  get chromaUrl() {
    return `http://${this.chromaHost}:${this.chromaPort}`;
  },
  dataDir: path.join(__dirname, "..", "data"),
  jdPath: path.join(__dirname, "..", "data", "job-description.txt"),
};
