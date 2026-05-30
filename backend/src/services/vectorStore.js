/**
 * Vector Store Service — ChromaDB
 *
 * Manages all read/write operations for JD chunk embeddings stored in ChromaDB.
 * ChromaDB runs as a Docker container (see docker-compose.yml) and persists data
 * in a Docker volume. We provide our own embeddings (no Chroma default embedder).
 */

import { ChromaClient } from "chromadb";
import { config } from "../config.js";
import { embedText } from "./embeddings.js";

const COLLECTION_NAME = "jd_chunks";

let client = null;
let collection = null;

/**
 * getChromaClient()
 * -----------------
 * Returns a singleton ChromaDB client connected to the Docker server.
 * Reuses the same client instance across requests to avoid reconnecting.
 *
 * @returns {ChromaClient} Connected Chroma client (host/port from config)
 */
export async function getChromaClient() {
  if (!client) {
    client = new ChromaClient({
      host: config.chromaHost,
      port: config.chromaPort,
    });
  }
  return client;
}

/**
 * ensureChromaRunning()
 * ---------------------
 * Pings ChromaDB with a heartbeat to confirm the Docker container is up.
 * Throws a helpful error if Chroma is unreachable (e.g. docker not started).
 */
async function ensureChromaRunning() {
  const chroma = await getChromaClient();
  try {
    await chroma.heartbeat();
  } catch {
    throw new Error(
      `ChromaDB is not reachable at ${config.chromaUrl}. Start it with: docker compose up -d chroma`
    );
  }
}

/**
 * getCollection()
 * ---------------
 * Opens the existing `jd_chunks` collection from ChromaDB.
 * Caches the collection in memory after first access.
 *
 * @returns {Collection} Chroma collection containing JD chunk embeddings
 * @throws If collection does not exist (user must run `npm run ingest` first)
 */
export async function getCollection() {
  if (collection) return collection;

  await ensureChromaRunning();
  const chroma = await getChromaClient();

  try {
    collection = await chroma.getCollection({
      name: COLLECTION_NAME,
      embeddingFunction: null, // we supply embeddings ourselves during ingest
    });
    return collection;
  } catch {
    throw new Error(
      "Vector store is empty. Run `npm run ingest` in the backend folder first."
    );
  }
}

/**
 * upsertChunks(chunks, embeddings, embeddingModel)
 * ------------------------------------------------
 * Replaces the entire JD collection in ChromaDB with fresh data.
 * Used by the ingest script after chunking and embedding the job description.
 *
 * Flow:
 *   1. Delete old collection (if any)
 *   2. Create new collection with cosine similarity space
 *   3. Insert chunk ids, embeddings, document text, and metadata
 *
 * @param {Array} chunks - [{ id, content, tokenEstimate }, ...]
 * @param {Array} embeddings - Pre-computed float vectors (one per chunk)
 * @param {string} embeddingModel - Model name stored in collection metadata
 * @returns {{ count: number, embeddingModel: string }}
 */
export async function upsertChunks(chunks, embeddings, embeddingModel) {
  await ensureChromaRunning();
  const chroma = await getChromaClient();

  try {
    await chroma.deleteCollection({ name: COLLECTION_NAME });
  } catch {
    // collection may not exist on first ingest
  }

  collection = await chroma.createCollection({
    name: COLLECTION_NAME,
    embeddingFunction: null,
    metadata: {
      "hnsw:space": "cosine",
      embeddingModel,
    },
  });

  await collection.add({
    ids: chunks.map((c) => c.id),
    embeddings,
    documents: chunks.map((c) => c.content),
    metadatas: chunks.map((c) => ({
      tokenEstimate: c.tokenEstimate,
    })),
  });

  return { count: chunks.length, embeddingModel };
}

/**
 * getVectorStoreStats()
 * ---------------------
 * Returns summary info about the vector store for the /health endpoint.
 * Reports chunk count, embedding model, storage type, and Chroma URL.
 *
 * @returns {{ chunks: number, model: string, storage: string, chromaUrl: string }}
 */
export async function getVectorStoreStats() {
  try {
    const col = await getCollection();
    const count = await col.count();
    const meta = col.metadata ?? {};

    return {
      chunks: count,
      model: meta.embeddingModel ?? config.embeddingModel,
      storage: "chromadb",
      chromaUrl: config.chromaUrl,
    };
  } catch (err) {
    if (
      err.message.includes("empty") ||
      err.message.includes("not reachable") ||
      err.message.includes("Could not connect")
    ) {
      return {
        chunks: 0,
        model: config.embeddingModel,
        storage: "chromadb",
        chromaUrl: config.chromaUrl,
      };
    }
    throw err;
  }
}

/**
 * searchSimilar(query, topK)
 * --------------------------
 * Core retrieval step of the RAG pipeline.
 * Embeds the user's question, then queries ChromaDB for the most similar JD chunks.
 *
 * Flow:
 *   1. Embed the query text into a vector
 *   2. Query ChromaDB with cosine distance
 *   3. Return top-K chunks ranked by similarity score
 *
 * @param {string} query - User's natural language question
 * @param {number} topK - Number of chunks to retrieve (default from config)
 * @returns {Array<{ id, content, score, tokenEstimate }>}
 */
export async function searchSimilar(query, topK = config.topK) {
  const col = await getCollection();
  const count = await col.count();

  if (count === 0) {
    throw new Error(
      "Vector store is empty. Run `npm run ingest` in the backend folder first."
    );
  }

  const queryVector = await embedText(query);

  const results = await col.query({
    queryEmbeddings: [queryVector],
    nResults: Math.min(topK, count),
    include: ["documents", "metadatas", "distances"],
  });

  const ids = results.ids[0] ?? [];
  const documents = results.documents[0] ?? [];
  const distances = results.distances[0] ?? [];
  const metadatas = results.metadatas[0] ?? [];

  // Convert cosine distance (0 = identical) to a 0–1 similarity score
  return ids.map((id, i) => ({
    id,
    content: documents[i] ?? "",
    score: 1 - (distances[i] ?? 1),
    tokenEstimate: metadatas[i]?.tokenEstimate ?? null,
  }));
}
