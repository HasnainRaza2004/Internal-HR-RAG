/**
 * RAG Pipeline Service
 *
 * Orchestrates Retrieval-Augmented Generation:
 *   Retrieve relevant JD chunks → Build strict prompt → Generate answer via Ollama
 */

import { config } from "../config.js";
import { searchSimilar } from "./vectorStore.js";

// System prompt that forces the LLM to answer ONLY from retrieved context
const SYSTEM_INSTRUCTION = `You are an HR assistant for VentureDive. Answer the user's question strictly using the provided job description context.

Rules:
- Only use facts explicitly stated in the context.
- If the answer is not in the context, respond exactly: "I don't have that information."
- When listing technologies, skills, or requirements, include every item explicitly mentioned in the context (do not omit items).
- Be concise and professional.
- Do not invent benefits, policies, salaries, or perks not mentioned in the context.`;

/**
 * buildPrompt(question, chunks)
 * -----------------------------
 * Combines the system instruction, retrieved JD chunks, and user question
 * into a single prompt string sent to Ollama.
 *
 * Each chunk is labeled as [Source N — chunk-id] so the LLM knows which
 * context sections it is drawing from.
 *
 * @param {string} question - User's question
 * @param {Array} chunks - Retrieved chunks from vector search
 * @returns {string} Full prompt ready for the LLM
 */
export function buildPrompt(question, chunks) {
  const context = chunks
    .map((chunk, i) => `[Source ${i + 1} — ${chunk.id}]\n${chunk.content}`)
    .join("\n\n---\n\n");

  return `${SYSTEM_INSTRUCTION}

Context:
${context}

Question: ${question}

Answer:`;
}

/**
 * retrieveContext(question)
 * ------------------------
 * Retrieval step: finds the top-K most relevant JD chunks for a question.
 * Delegates to ChromaDB vector search in vectorStore.js.
 *
 * @param {string} question - User's natural language question
 * @returns {Array} Top matching chunks with id, content, and similarity score
 */
export async function retrieveContext(question) {
  return searchSimilar(question, config.topK);
}

/**
 * generateWithOllama(prompt, options)
 * -----------------------------------
 * Sends a prompt to the local Ollama LLM and returns the generated text.
 * Supports both blocking (full response) and streaming (token-by-token) modes.
 *
 * Streaming mode reads Ollama's newline-delimited JSON stream and calls
 * onToken() for each partial token, enabling SSE to the frontend.
 *
 * @param {string} prompt - Full RAG prompt with context + question
 * @param {object} options
 * @param {boolean} options.stream - If true, stream tokens via onToken callback
 * @param {Function} options.onToken - Called with each token string during streaming
 * @returns {string} Complete generated answer text
 */
export async function generateWithOllama(prompt, { stream = false, onToken } = {}) {
  const url = `${config.ollamaBaseUrl}/api/generate`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt,
      stream,
      options: {
        temperature: 0.1, // low temperature = more factual, less creative
        num_predict: 512,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Ollama request failed (${response.status}). Is Ollama running with model "${config.ollamaModel}"? ${body}`
    );
  }

  // Non-streaming: Ollama returns one JSON object with the full response
  if (!stream) {
    const data = await response.json();
    return data.response?.trim() ?? "";
  }

  // Streaming: read NDJSON lines, emit each token as it arrives
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value, { stream: true }).split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.response) {
          fullText += parsed.response;
          onToken?.(parsed.response);
        }
      } catch {
        // skip malformed lines from Ollama stream
      }
    }
  }

  return fullText.trim();
}

/**
 * answerQuestion(question, options)
 * ---------------------------------
 * Full RAG pipeline entry point used by the chat API routes.
 *
 * Flow:
 *   1. Retrieve top-K relevant JD chunks (vector search)
 *   2. Build a grounded prompt with those chunks
 *   3. Generate answer via Ollama (optionally streamed)
 *   4. Return answer + source citations for the frontend
 *
 * @param {string} question - User's question
 * @param {object} options - { stream, onToken } passed to generateWithOllama
 * @returns {{ answer: string, sources: Array<{ id, excerpt, score }> }}
 */
export async function answerQuestion(question, { stream = false, onToken } = {}) {
  const chunks = await retrieveContext(question);
  const prompt = buildPrompt(question, chunks);
  const answer = await generateWithOllama(prompt, { stream, onToken });

  return {
    answer,
    sources: chunks.map(({ id, content, score }) => ({
      id,
      excerpt: content.slice(0, 280) + (content.length > 280 ? "…" : ""),
      score: Number(score.toFixed(4)),
    })),
  };
}
