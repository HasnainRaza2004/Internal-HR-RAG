/**
 * Embeddings Service
 *
 * Converts text into dense vector representations using a local open-source model.
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions, runs via @xenova/transformers).
 * No API keys required — model downloads once and caches locally.
 */

import { pipeline } from "@xenova/transformers";
import { config } from "../config.js";

let embedder = null;

/**
 * getEmbedder()
 * -------------
 * Lazy-loads the Hugging Face embedding pipeline on first use.
 * Uses quantized weights for faster inference on CPU.
 *
 * @returns {Pipeline} Feature-extraction pipeline instance
 */
async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", config.embeddingModel, {
      quantized: true,
    });
  }
  return embedder;
}

/**
 * embedText(text)
 * ---------------
 * Converts a single string into a normalized 384-dim embedding vector.
 * Used for both ingest (chunk embeddings) and query-time search.
 *
 * @param {string} text - Input text to embed
 * @returns {number[]} Normalized float vector (length 384)
 */
export async function embedText(text) {
  const model = await getEmbedder();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/**
 * embedTexts(texts)
 * -----------------
 * Batch embeds multiple strings sequentially.
 * Called during ingest to embed all JD chunks before storing in ChromaDB.
 *
 * @param {string[]} texts - Array of text strings
 * @returns {number[][]} Array of embedding vectors (one per input text)
 */
export async function embedTexts(texts) {
  const vectors = [];
  for (const text of texts) {
    vectors.push(await embedText(text));
  }
  return vectors;
}
