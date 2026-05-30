/**
 * Text Chunking Service
 *
 * Splits the job description into smaller, overlapping chunks suitable for
 * embedding and retrieval. Target size is ~250 tokens with ~50 token overlap
 * so context isn't lost at chunk boundaries.
 */

/**
 * estimateTokens(text)
 * --------------------
 * Approximates token count without a tokenizer (~4 chars per token for English).
 * Used to decide when to split text during chunking.
 *
 * @param {string} text
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * chunkText(text, chunkSize, chunkOverlap)
 * ----------------------------------------
 * Splits a long document into semantic chunks with overlap.
 *
 * Strategy:
 *   1. Split on paragraph breaks first (preserves section structure)
 *   2. If a paragraph exceeds chunkSize, split further by sentences
 *   3. Add overlap from adjacent chunks so boundary context isn't lost
 *
 * @param {string} text - Full job description text
 * @param {number} chunkSize - Target tokens per chunk (default 250)
 * @param {number} chunkOverlap - Overlap tokens between adjacent chunks (default 50)
 * @returns {Array<{ id, content, tokenEstimate }>}
 */
export function chunkText(text, chunkSize = 250, chunkOverlap = 50) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  // Pushes the current buffer into the chunks array and resets it
  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (estimateTokens(candidate) <= chunkSize) {
      current = candidate;
      continue;
    }

    if (current) {
      flush();
    }

    if (estimateTokens(paragraph) <= chunkSize) {
      current = paragraph;
      continue;
    }

    // Paragraph too large — split by sentences
    const sentences = paragraph.match(/[^.!?]+[.!?]+|\S+/g) || [paragraph];
    let sentenceBuffer = "";

    for (const sentence of sentences) {
      const next = sentenceBuffer ? `${sentenceBuffer} ${sentence.trim()}` : sentence.trim();
      if (estimateTokens(next) <= chunkSize) {
        sentenceBuffer = next;
      } else {
        if (sentenceBuffer) {
          chunks.push(sentenceBuffer.trim());
        }
        sentenceBuffer = sentence.trim();
      }
    }

    if (sentenceBuffer) {
      current = sentenceBuffer;
    }
  }

  flush();

  if (chunkOverlap <= 0 || chunks.length <= 1) {
    return chunks.map((content, index) => ({
      id: `chunk-${index}`,
      content,
      tokenEstimate: estimateTokens(content),
    }));
  }

  // Add overlap: prepend tail of previous chunk and append head of next chunk
  const overlapped = [];
  for (let i = 0; i < chunks.length; i++) {
    const prevTail = i > 0 ? tailByTokens(chunks[i - 1], chunkOverlap) : "";
    const nextHead = i < chunks.length - 1 ? headByTokens(chunks[i + 1], chunkOverlap) : "";
    const parts = [prevTail, chunks[i], nextHead].filter(Boolean);
    const content = parts.join("\n\n").trim();
    overlapped.push({
      id: `chunk-${i}`,
      content,
      tokenEstimate: estimateTokens(content),
    });
  }

  return overlapped;
}

/**
 * tailByTokens(text, tokens)
 * --------------------------
 * Returns the last ~N tokens worth of words from a text string.
 * Used to create overlap from the previous chunk.
 */
function tailByTokens(text, tokens) {
  const words = text.split(/\s+/);
  const approxWords = Math.max(1, Math.ceil(tokens * 0.75));
  return words.slice(-approxWords).join(" ");
}

/**
 * headByTokens(text, tokens)
 * --------------------------
 * Returns the first ~N tokens worth of words from a text string.
 * Used to create overlap from the next chunk.
 */
function headByTokens(text, tokens) {
  const words = text.split(/\s+/);
  const approxWords = Math.max(1, Math.ceil(tokens * 0.75));
  return words.slice(0, approxWords).join(" ");
}
