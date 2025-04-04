import { and, cosineDistance, eq, inArray, sql } from "drizzle-orm"
import { PgliteDatabase, drizzle } from "drizzle-orm/pglite"
import { useCallback } from "react"

import { usePGlite } from "@/context/db"

import type { Note } from "@/db/interfaces"
import * as schema from "@/db/schema"

// Define the structure for context-aware note results
export interface ContextNote {
  note: Note
  similarity: number
  lineNumber?: number
  endLine?: number
  startLine?: number
}

// Define threshold for similarity
const SIMILARITY_THRESHOLD = 0.5

/**
 * Calculate cosine similarity between file chunks and notes
 * @param db Database instance
 * @param fileId Current file ID
 * @param vaultId Current vault ID
 * @param noteIds Array of note IDs to check for similarity
 * @returns Array of ContextNote objects with similarity scores
 */
export async function findSimilarNotesForFile(
  db: PgliteDatabase<typeof schema>,
  fileId: string,
  vaultId: string,
  noteIds: string[],
): Promise<ContextNote[]> {
  try {
    if (!fileId || !vaultId || noteIds.length === 0) {
      return []
    }

    // First, get all note embeddings for the specified notes
    const noteEmbeddings = await db.query.noteEmbeddings.findMany({
      where: inArray(schema.noteEmbeddings.noteId, noteIds),
    })

    if (noteEmbeddings.length === 0) return []

    // Get all file chunk embeddings for the current file
    const fileEmbeddings = await db.query.fileEmbeddings.findMany({
      where: and(
        eq(schema.fileEmbeddings.fileId, fileId),
        eq(schema.fileEmbeddings.vaultId, vaultId),
      ),
    })

    if (fileEmbeddings.length === 0) return []

    // Map to store best similarity scores for each note
    const bestMatches = new Map<string, ContextNote>()

    // For each note embedding, find the most similar file chunk
    for (const noteEmb of noteEmbeddings) {
      // Get the full note object to include in results
      const note = await db.query.notes.findFirst({
        where: eq(schema.notes.id, noteEmb.noteId),
      })

      if (!note || !noteEmb.embedding) continue

      // For this note, find the best matching file chunk using Drizzle's cosineDistance helper
      // This calculates similarity more effectively using the vector operations
      const similarity = sql<number>`1 - (${cosineDistance(schema.fileEmbeddings.embedding, noteEmb.embedding)})`

      const similarityResults = await db
        .select({
          nodeId: schema.fileEmbeddings.nodeId,
          startLine: schema.fileEmbeddings.startLine,
          endLine: schema.fileEmbeddings.endLine,
          similarity,
        })
        .from(schema.fileEmbeddings)
        .where(
          and(eq(schema.fileEmbeddings.fileId, fileId), eq(schema.fileEmbeddings.vaultId, vaultId)),
        )
        .orderBy(cosineDistance(schema.fileEmbeddings.embedding, noteEmb.embedding))
        .limit(1)

      if (similarityResults.length > 0) {
        const result = similarityResults[0]
        const similarityScore = result.similarity

        if (similarityScore >= SIMILARITY_THRESHOLD) {
          bestMatches.set(noteEmb.noteId, {
            note,
            similarity: similarityScore,
            startLine: result.startLine!,
            endLine: result.endLine!,
            lineNumber: result.startLine!, // Default to start line for positioning
          })
        }
      }
    }

    // Convert map to array and sort by similarity descending
    const results = Array.from(bestMatches.values()).sort((a, b) => b.similarity - a.similarity)
    return results
  } catch (error) {
    console.error("[ContextNotes] Error finding similar notes:", error)
    return []
  }
}

// Add a retry wrapper function and improve the useContextAwareNotes hook
// Add a function to retry operations
async function withRetry<T>(operation: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (retries <= 1) throw error

    await new Promise((resolve) => setTimeout(resolve, delay))
    return withRetry(operation, retries - 1, delay * 1.5)
  }
}

/**
 * Hook to get context-aware notes for the current file and visible notes
 * @param fileId Current file ID
 * @param vaultId Current vault ID
 * @param noteIds Array of note IDs to check
 * @returns Array of context notes with positioning information
 */
export function useContextAwareNotes(
  fileId: string | undefined,
  vaultId: string | undefined,
  noteIds: string[],
) {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  // Use useCallback to memoize the function to prevent infinite rerenders
  const getSimilarNotes = useCallback(async () => {
    if (!fileId || !vaultId || noteIds.length === 0) return []

    try {
      // Use the retry wrapper to handle transient failures
      return await withRetry(() => findSimilarNotesForFile(db, fileId, vaultId, noteIds))
    } catch (error) {
      console.error("[ContextNotes] Failed to find similar notes after retries:", error)
      return []
    }
  }, [db, fileId, vaultId, noteIds])

  return {
    getSimilarNotes,
  }
}

/**
 * Utility to debug vector similarity - for development use
 */
export async function debugVectorSimilarity(
  db: PgliteDatabase<typeof schema>,
  fileId: string,
  noteId: string,
): Promise<void> {
  try {
    console.log(`[Vector Debug] Testing similarity between file ${fileId} and note ${noteId}`)

    // Get note embedding
    const noteEmb = await db.query.noteEmbeddings.findFirst({
      where: eq(schema.noteEmbeddings.noteId, noteId),
    })

    if (!noteEmb) {
      console.log(`[Vector Debug] No embedding found for note ${noteId}`)
      return
    }

    // Get file embeddings
    const fileEmbs = await db.query.fileEmbeddings.findMany({
      where: eq(schema.fileEmbeddings.fileId, fileId),
    })

    if (fileEmbs.length === 0) {
      console.log(`[Vector Debug] No embeddings found for file ${fileId}`)
      return
    }

    // Test different similarity metrics
    console.log(
      `[Vector Debug] Testing different similarity metrics for ${fileEmbs.length} file chunks:`,
    )

    for (let i = 0; i < Math.min(3, fileEmbs.length); i++) {
      const fileEmb = fileEmbs[i]

      // Test cosine similarity
      const cosineResult = await db.execute(sql`
        SELECT 1 - (${noteEmb.embedding} <=> ${fileEmb.embedding}) AS cosine_similarity
      `)

      // Test inner product
      const ipResult = await db.execute(sql`
        SELECT (${noteEmb.embedding} <#> ${fileEmb.embedding}) AS inner_product
      `)

      // Test L2 distance
      const l2Result = await db.execute(sql`
        SELECT (${noteEmb.embedding} <-> ${fileEmb.embedding}) AS l2_distance
      `)

      console.log(`[Vector Debug] Chunk ${i} (lines ${fileEmb.startLine}-${fileEmb.endLine}):`)
      console.log(`  Cosine similarity: ${cosineResult.rows[0].cosine_similarity}`)
      console.log(`  Inner product: ${ipResult.rows[0].inner_product}`)
      console.log(`  L2 distance: ${l2Result.rows[0].l2_distance}`)
    }
  } catch (error) {
    console.error("[Vector Debug] Error:", error)
  }
}
