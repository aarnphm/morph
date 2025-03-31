import { PGlite, IdbFs } from "@electric-sql/pglite"
import { PGLITE_DB_NAME } from "@/lib/db"
import { live } from "@electric-sql/pglite/live"
import { vector } from "@electric-sql/pglite/vector"

interface EmbedMetadataResponse {
  llm: any
  embed: {
    model_id: string
    embed_type: string
    dimensions: number
    M: number
    ef_construction: number
  }
}

let embedMetadata: EmbedMetadataResponse["embed"] | null = null

async function fetchEmbedMetadata(): Promise<EmbedMetadataResponse["embed"]> {
  if (embedMetadata) {
    return embedMetadata
  }

  try {
    // Use a simple function here as process.env might not be available early
    const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT || "http://localhost:8000"
    const response = await fetch(`${apiEndpoint}/metadata`)
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.status}`)
    }
    const data: EmbedMetadataResponse = await response.json()
    embedMetadata = data.embed
    return data.embed
  } catch (error) {
    console.error("Failed to fetch embedding metadata:", error)
    throw new Error("Could not retrieve embedding configuration.")
  }
}

// Helper function to convert array to pgvector string format
const arrayToPgvector = (arr: number[]) => {
  return "[" + arr.join(",") + "]"
}

// Adjust types to include both extensions
let pgliteInstance: PGlite | null = null
let initializationPromise: Promise<PGlite> | null = null

// Function to get the dynamic table name for notes
function getNoteEmbeddingTableName(metadata: EmbedMetadataResponse["embed"]): string {
  // Sanitize embed_type to be a valid table name part
  const sanitizedType = metadata.embed_type.replace(/[^a-z0-9_]/gi, "_")
  return `${sanitizedType}_note_embeddings` // Added _note_
}

// Function to get the dynamic table name for essays
function getEssayEmbeddingTableName(metadata: EmbedMetadataResponse["embed"]): string {
  // Sanitize embed_type to be a valid table name part
  const sanitizedType = metadata.embed_type.replace(/[^a-z0-9_]/gi, "_")
  return `${sanitizedType}_essay_embeddings` // Added _essay_
}

// Function to initialize the database schema
async function initializeInstance(): Promise<PGlite> {
  try {
    // Ensure metadata is fetched before initializing PGlite
    const metadata = await fetchEmbedMetadata()
    const noteTableName = getNoteEmbeddingTableName(metadata)
    const essayTableName = getEssayEmbeddingTableName(metadata) // Get essay table name
    const dimensions = metadata.dimensions

    // Use PGlite.create() for initialization
    const pg = await PGlite.create({
      fs: new IdbFs(PGLITE_DB_NAME),
      relaxedDurability: true,
      extensions: { live, vector },
    })

    // Create the dynamically named table for notes
    await pg.exec(`CREATE EXTENSION IF NOT EXISTS vector;`) // Ensure vector extension is enabled in DB
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS ${noteTableName} (
        note_id TEXT PRIMARY KEY,
        embedding VECTOR(${dimensions}),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Create the dynamically named table for essays
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS ${essayTableName} (
        vault_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL, -- Added chunk identifier
        embedding VECTOR(${dimensions}),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (vault_id, file_id, chunk_id) -- Updated composite primary key
      );
    `)

    // Create an HNSW index for inner product search on notes table
    // Adjust m and ef_construction as needed
    // vector_ip_ops is for inner product
    // vector_l2_ops is for L2 distance
    // vector_cosine_ops is for cosine distance
    const noteIndexName = `idx_${noteTableName}_hnsw`
    await pg.exec(`
      CREATE INDEX IF NOT EXISTS ${noteIndexName} ON ${noteTableName}
      USING hnsw (embedding vector_ip_ops)
      WITH (m = ${metadata.M}, ef_construction = ${metadata.ef_construction});
    `)

    // Create an HNSW index for inner product search on essays table
    const essayIndexName = `idx_${essayTableName}_hnsw`
    await pg.exec(`
      CREATE INDEX IF NOT EXISTS ${essayIndexName} ON ${essayTableName}
      USING hnsw (embedding vector_ip_ops)
      WITH (m = ${metadata.M}, ef_construction = ${metadata.ef_construction});
    `)

    pgliteInstance = pg
    return pg
  } catch (error) {
    console.error("Failed to initialize PGlite database:", error)
    initializationPromise = null // Reset promise on failure
    throw error
  }
}

// Function to get the initialized PGlite instance
export async function getPgLiteInstance(): Promise<PGlite> {
  if (pgliteInstance) {
    return pgliteInstance
  }
  if (!initializationPromise) {
    initializationPromise = initializeInstance()
  }
  return initializationPromise
}

// Function to add or update a note embedding
export async function saveNoteEmbedding(noteId: string, embedding: number[]) {
  try {
    const metadata = await fetchEmbedMetadata() // Need metadata for table name
    const tableName = getNoteEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()
    const embeddingString = arrayToPgvector(embedding)

    await pg.query(
      `
        INSERT INTO ${tableName} (note_id, embedding) VALUES ($1, $2)
        ON CONFLICT (note_id) DO UPDATE SET embedding = $2, created_at = CURRENT_TIMESTAMP;
      `,
      [noteId, embeddingString],
    )
    console.debug(`Embedding saved for note ${noteId} in table ${tableName}`)
  } catch (error) {
    console.error(`Failed to save embedding for note ${noteId}:`, error)
    throw error
  }
}

// Function to check if a note embedding exists
export async function hasNoteEmbedding(noteId: string): Promise<boolean> {
  try {
    const metadata = await fetchEmbedMetadata() // Need metadata for table name
    const tableName = getNoteEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()
    const result = await pg.query(`SELECT 1 FROM ${tableName} WHERE note_id = $1 LIMIT 1`, [noteId])
    return result.rows.length > 0
  } catch (error) {
    console.error(`Failed to check embedding for note ${noteId}:`, error)
    return false
  }
}

// Function to add or update an essay embedding for a specific chunk
export async function saveEssayEmbedding(
  vaultId: string,
  fileId: string,
  chunkId: string,
  embedding: number[],
) {
  try {
    const metadata = await fetchEmbedMetadata()
    const tableName = getEssayEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()
    const embeddingString = arrayToPgvector(embedding)

    await pg.query(
      `
        INSERT INTO ${tableName} (vault_id, file_id, chunk_id, embedding) VALUES ($1, $2, $3, $4)
        ON CONFLICT (vault_id, file_id, chunk_id) DO UPDATE SET embedding = $4, created_at = CURRENT_TIMESTAMP;
      `,
      [vaultId, fileId, chunkId, embeddingString],
    )
    console.debug(
      `Embedding saved for essay chunk ${vaultId}/${fileId}/${chunkId} in table ${tableName}`,
    )
  } catch (error) {
    console.error(
      `Failed to save embedding for essay chunk ${vaultId}/${fileId}/${chunkId}:`,
      error,
    )
    throw error
  }
}

// Function to check if an essay embedding exists for a specific chunk
export async function hasEssayEmbedding(
  vaultId: string,
  fileId: string,
  chunkId: string,
): Promise<boolean> {
  try {
    const metadata = await fetchEmbedMetadata()
    const tableName = getEssayEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()
    const result = await pg.query(
      `SELECT 1 FROM ${tableName} WHERE vault_id = $1 AND file_id = $2 AND chunk_id = $3 LIMIT 1`,
      [vaultId, fileId, chunkId],
    )
    return result.rows.length > 0
  } catch (error) {
    console.error(
      `Failed to check embedding for essay chunk ${vaultId}/${fileId}/${chunkId}:`,
      error,
    )
    return false
  }
}

// Example Similarity Search Function (Inner Product) for Notes
// Returns note IDs ordered by similarity (highest inner product first)
export async function findSimilarNotes(
  queryEmbedding: number[],
  limit: number = 5,
): Promise<string[]> {
  try {
    const metadata = await fetchEmbedMetadata()
    const tableName = getNoteEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()
    const embeddingString = arrayToPgvector(queryEmbedding)

    // <-> operator for L2 distance
    // <#> operator for inner product (negative, so smaller is better - hence ASC)
    // <=> operator for cosine distance
    // We want HIGHEST inner product, which means the MOST NEGATIVE <#> result.
    // Therefore, we order by <#> ASC.
    const result = await pg.query<{ note_id: string }>( // Specify return type
      `SELECT note_id FROM ${tableName} ORDER BY embedding <#> $1 ASC LIMIT $2`,
      [embeddingString, limit],
    )

    return result.rows.map((row) => row.note_id)
  } catch (error) {
    console.error("Failed to perform similarity search for notes:", error)
    return []
  }
}

// Optional: Example Similarity Search Function for Essays
// Returns file IDs ordered by similarity
export async function findSimilarEssays(
  vaultId: string,
  queryEmbedding: number[],
  limit: number = 5,
): Promise<string[]> {
  try {
    const metadata = await fetchEmbedMetadata()
    const tableName = getEssayEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()
    const embeddingString = arrayToPgvector(queryEmbedding)

    // Assuming we only want results within the same vault
    const result = await pg.query<{ file_id: string }>(
      `SELECT file_id FROM ${tableName} WHERE vault_id = $1 ORDER BY embedding <#> $2 ASC LIMIT $3`,
      [vaultId, embeddingString, limit],
    )

    return result.rows.map((row) => row.file_id)
  } catch (error) {
    console.error(`Failed to perform similarity search for essays in vault ${vaultId}:`, error)
    return []
  }
}

// Function to get a specific note embedding
export async function getNoteEmbedding(noteId: string): Promise<number[] | null> {
  try {
    const metadata = await fetchEmbedMetadata()
    const tableName = getNoteEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()

    const result = await pg.query<{ embedding: string }>(
      `SELECT embedding FROM ${tableName} WHERE note_id = $1 LIMIT 1`,
      [noteId],
    )

    if (result.rows.length > 0) {
      // Embedding is stored as a string '[1,2,3]', parse it
      return JSON.parse(result.rows[0].embedding) as number[]
    } else {
      return null // Not found
    }
  } catch (error) {
    console.error(`Failed to get embedding for note ${noteId}:`, error)
    return null // Return null on error
  }
}

// Function to get a specific essay embedding for a chunk
export async function getEssayEmbedding(
  vaultId: string,
  fileId: string,
  chunkId: string,
): Promise<number[] | null> {
  try {
    const metadata = await fetchEmbedMetadata()
    const tableName = getEssayEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()

    const result = await pg.query<{ embedding: string }>(
      `SELECT embedding FROM ${tableName} WHERE vault_id = $1 AND file_id = $2 AND chunk_id = $3 LIMIT 1`,
      [vaultId, fileId, chunkId],
    )

    if (result.rows.length > 0) {
      // Embedding is stored as a string '[1,2,3]', parse it
      return JSON.parse(result.rows[0].embedding) as number[]
    } else {
      return null // Not found
    }
  } catch (error) {
    console.error(`Failed to get embedding for essay chunk ${vaultId}/${fileId}/${chunkId}:`, error)
    return null // Return null on error
  }
}

// Function to check if ANY chunks exist for an essay
export async function hasAnyEssayEmbedding(vaultId: string, fileId: string): Promise<boolean> {
  try {
    const metadata = await fetchEmbedMetadata()
    const tableName = getEssayEmbeddingTableName(metadata)
    const pg = await getPgLiteInstance()

    const result = await pg.query(
      `SELECT 1 FROM ${tableName} WHERE vault_id = $1 AND file_id = $2 LIMIT 1`,
      [vaultId, fileId],
    )
    return result.rows.length > 0
  } catch (error) {
    console.error(`Failed to check if any embeddings exist for essay ${vaultId}/${fileId}:`, error)
    return false
  }
}

export async function findSimilarEssayChunks(
  pg: PGlite,
  noteId: string,
  vaultId: string,
  fileId: string,
  limit: number = 1, // Number of similar chunks to return
): Promise<{ chunkId: string; distance: number }[]> {
  if (!pg) {
    console.error("PGlite instance is not available.")
    return []
  }

  try {
    // 1. Get the embedding for the given noteId from PGlite
    // Assuming a table 'note_embeddings' exists. Adjust table/column names if different.
    const noteEmbeddingResult = await pg.query<{ embedding: string }>(
      `SELECT embedding::text FROM note_embeddings WHERE note_id = $1`,
      [noteId],
    )

    if (!noteEmbeddingResult.rows || noteEmbeddingResult.rows.length === 0) {
      console.warn(`No embedding found for note ${noteId}`)
      return []
    }

    // The embedding is stored as text, needs to be used in the query
    const noteEmbeddingStr = noteEmbeddingResult.rows[0].embedding

    // 2. Query essay_embeddings to find similar chunks using cosine distance (<=>)
    // Ensure pgvector is enabled and an index exists on the embedding column for performance.
    // Example index: CREATE INDEX ON essay_embeddings USING hnsw (embedding vector_cosine_ops);
    const similarityResult = await pg.query<{ chunk_id: string; distance: number }>(
      `
     SELECT
       chunk_id,
       embedding <=> $1::vector AS distance
     FROM essay_embeddings
     WHERE vault_id = $2 AND file_id = $3
     ORDER BY distance ASC -- ASC because <=> is distance (lower is better)
     LIMIT $4;
     `,
      [noteEmbeddingStr, vaultId, fileId, limit],
    )

    if (!similarityResult.rows) {
      return []
    }

    return similarityResult.rows.map((row) => ({
      chunkId: row.chunk_id,
      distance: row.distance,
    }))
  } catch (error) {
    console.error("Error finding similar essay chunks:", error)
    // Check for specific pgvector errors if needed
    if (error instanceof Error && error.message.includes("vector")) {
      console.error("Ensure the pgvector extension is enabled and tables/embeddings exist.")
    }
    return []
  }
}
