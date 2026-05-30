/**
 * Chat API Routes
 *
 * Exposes two endpoints for the RAG chatbot:
 *   POST /api/chat         — blocking JSON response
 *   POST /api/chat/stream  — Server-Sent Events (SSE) streaming response
 */

import { Router } from "express";
import {
  answerQuestion,
  buildPrompt,
  generateWithOllama,
  retrieveContext,
} from "../services/rag.js";

const router = Router();

/**
 * POST /api/chat
 * --------------
 * Non-streaming chat endpoint. Waits for the full LLM response before returning.
 *
 * Request body: { "question": "..." }
 * Response:     { "answer": "...", "sources": [{ id, excerpt, score }] }
 */
router.post("/", async (req, res) => {
  const { question } = req.body ?? {};

  if (!question?.trim()) {
    return res.status(400).json({ error: "Question is required." });
  }

  try {
    const result = await answerQuestion(question.trim());
    return res.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate answer." });
  }
});

/**
 * POST /api/chat/stream
 * ---------------------
 * Streaming chat endpoint using Server-Sent Events (SSE).
 * Sends events in order: sources → token (×N) → done
 *
 * Event types:
 *   { type: "sources", sources: [...] }  — retrieved JD chunks (sent first)
 *   { type: "token",   token: "..." }    — one LLM token at a time
 *   { type: "done" }                      — stream finished
 *   { type: "error",   error: "..." }     — on failure
 */
router.post("/stream", async (req, res) => {
  const { question } = req.body ?? {};

  if (!question?.trim()) {
    return res.status(400).json({ error: "Question is required." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const chunks = await retrieveContext(question.trim());

    // Send source citations immediately so the UI can show them while tokens stream
    res.write(
      `data: ${JSON.stringify({
        type: "sources",
        sources: chunks.map(({ id, content, score }) => ({
          id,
          excerpt: content.slice(0, 280) + (content.length > 280 ? "…" : ""),
          score: Number(score.toFixed(4)),
        })),
      })}\n\n`
    );

    const prompt = buildPrompt(question.trim(), chunks);

    await generateWithOllama(prompt, {
      stream: true,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ type: "token", token })}\n\n`);
      },
    });

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Stream error:", err);
    res.write(
      `data: ${JSON.stringify({ type: "error", error: err.message || "Stream failed." })}\n\n`
    );
    res.end();
  }
});

export default router;
