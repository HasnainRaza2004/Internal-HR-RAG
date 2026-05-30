/**
 * Ingest Script
 *
 * One-time (or re-run) pipeline to load the job description into ChromaDB.
 *
 * Steps:
 *   1. Read job-description.txt
 *   2. Split into overlapping chunks (~250 tokens each)
 *   3. Generate local embeddings for each chunk
 *   4. Store chunks + vectors in ChromaDB (replaces existing collection)
 *
 * Run: npm run ingest  (ChromaDB Docker container must be running first)
 */

import fs from "fs/promises";
import { config } from "../src/config.js";
import { chunkText } from "../src/services/chunker.js";
import { embedTexts } from "../src/services/embeddings.js";
import { upsertChunks } from "../src/services/vectorStore.js";

/**
 * main()
 * ------
 * Orchestrates the full ingest pipeline and logs progress to the console.
 */
async function main() {
  console.log("Loading job description…");
  const raw = await fs.readFile(config.jdPath, "utf-8");

  console.log(`Chunking (target ~${config.chunkSize} tokens, overlap ${config.chunkOverlap})…`);
  const chunks = chunkText(raw, config.chunkSize, config.chunkOverlap);
  console.log(`Created ${chunks.length} chunks.`);

  console.log(`Generating embeddings with ${config.embeddingModel}…`);
  const embeddings = await embedTexts(chunks.map((c) => c.content));

  console.log(`Storing vectors in ChromaDB (${config.chromaUrl})…`);
  const result = await upsertChunks(chunks, embeddings, config.embeddingModel);

  console.log(`Saved ${result.count} chunks → ChromaDB at ${config.chromaUrl}`);
  console.log("Ingestion complete.");
}

main().catch((err) => {
  console.error("Ingestion failed:", err.message);
  process.exit(1);
});
