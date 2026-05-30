/**
 * Express Server Entry Point
 *
 * Starts the HR RAG backend API on port 3001 (configurable via .env).
 * Routes:
 *   GET  /health       — system status (chunk count, models, storage type)
 *   POST /api/chat     — blocking RAG chat
 *   POST /api/chat/stream — SSE streaming RAG chat
 */

import cors from "cors";
import express from "express";
import { config } from "./config.js";
import chatRouter from "./routes/chat.js";
import { getVectorStoreStats } from "./services/vectorStore.js";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

/**
 * GET /health
 * -----------
 * Returns backend status for the frontend status badge.
 * Reports chunk count in ChromaDB, embedding model, and Ollama model name.
 */
app.get("/health", async (_req, res) => {
  try {
    const store = await getVectorStoreStats();
    res.json({
      status: "ok",
      chunks: store.chunks,
      embeddingModel: store.model,
      storage: store.storage,
      ollamaModel: config.ollamaModel,
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

app.use("/api/chat", chatRouter);

app.listen(config.port, () => {
  console.log(`HR RAG backend listening on http://localhost:${config.port}`);
});
