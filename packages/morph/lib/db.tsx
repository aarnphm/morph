import { PGlite, IdbFs } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { vector } from "@electric-sql/pglite/vector"
import { createId } from "@paralleldrive/cuid2"
import { useContext } from "react"

export const PGLITE_DB_NAME = "morph-pglite"

export interface Settings {
  editor: {
    vim: boolean
    tabSize: number
  }
  shortcuts: {
    editMode: string
    toggleNotes: string
  }
  general: {
    ignorePatterns: string[]
  }
  citation: {
    enabled: boolean
    format: "biblatex" | "csl-json"
    databasePath?: string
  }
}

export const DEFAULT_SETTINGS: Settings = {
  editor: {
    vim: false,
    tabSize: 2,
  },
  shortcuts: {
    editMode: "e",
    toggleNotes: "i",
  },
  general: {
    ignorePatterns: [
      "**/.*",
      "**/node_modules/**",
      ".vercel/**",
      ".venv/**",
      "venv/**",
      "**/dist/**",
      "__pycache__/**",
      "*.log",
      ".DS_Store",
      ".obsidian",
    ],
  },
  citation: {
    enabled: false,
    format: "biblatex",
  },
}

type FileSystemHandleType = FileSystemFileHandle | FileSystemDirectoryHandle

export interface FileSystemTreeNode {
  name: string
  extension: string
  kind: "file" | "directory"
  id: string
  handle: FileSystemHandleType
  children?: FileSystemTreeNode[]
  isOpen?: boolean
  path: string
}

export interface Vault {
  id: string
  name: string
  lastOpened: Date
  tree: FileSystemTreeNode
  settings: Settings
}

export interface FileIndex {
  id: string
  name: string
  extension: string
  refs: {
    vaultId: string
  }
  embedding: {
    status: Note["embedding"]["status"]
    taskId?: Note["embedding"]["taskId"]
  }
}


export interface Reference {
  id: string
  vaultId: string
  handle: FileSystemFileHandle
  format: "biblatex" | "csl-json"
  path: string
  lastModified: Date
}

export interface Steering {
  authors?: string[]
  tonality?: { [key: string]: number }
  temperature?: number
  numSuggestions?: number
}

export interface Note {
  id: string
  content: string
  color: string
  createdAt: Date
  accessedAt: Date
  dropped: boolean
  refs: {
    fileId: string
    vaultId: string
    reasoningId: string
  }
  steering: Steering
  embedding: {
    status: "in_progress" | "success" | "failure" | "cancelled"
    taskId?: string
  }
}

export interface Reasoning {
  id: string
  content: string
  refs: {
    fileId: string
    vaultId: string
    noteIds: string[]
  }
  createdAt: Date
  accessedAt: Date
  duration: number
  steering: Steering
}




// Create DB instance singleton
let pgliteInstance: PGlite | null = null
let initPromise: Promise<PGlite> | null = null

async function initializeDb(): Promise<PGlite> {
  if (pgliteInstance) return pgliteInstance

  try {
    const pg = await PGlite.create({
      fs: new IdbFs(PGLITE_DB_NAME),
      relaxedDurability: true,
      extensions: { live, vector },
    })

    // Create tables
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS vaults (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lastOpened TIMESTAMP NOT NULL,
        tree JSONB NOT NULL,
        settings JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS references (
        id TEXT PRIMARY KEY,
        vaultId TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
        handle JSONB,
        format TEXT NOT NULL,
        path TEXT NOT NULL,
        lastModified TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        color TEXT NOT NULL,
        fileName TEXT NOT NULL,
        vaultId TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
        createdAt TIMESTAMP NOT NULL,
        lastModified TIMESTAMP NOT NULL,
        reasoningId TEXT,
        dropped BOOLEAN NOT NULL DEFAULT FALSE,
        steering JSONB,
        embedding_status TEXT CHECK (embedding_status IN ('in_progress', 'success', 'failure', 'cancelled')),
        embedding_taskId TEXT
      );

      CREATE TABLE IF NOT EXISTS reasonings (
        id TEXT PRIMARY KEY,
        fileName TEXT NOT NULL,
        vaultId TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        noteIds JSONB NOT NULL,
        createdAt TIMESTAMP NOT NULL,
        duration INTEGER NOT NULL,
        steering JSONB
      );

      CREATE TABLE IF NOT EXISTS fileNames (
        id TEXT PRIMARY KEY,
        fileName TEXT NOT NULL,
        fileId TEXT NOT NULL,
        vaultId TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
        embedding_status TEXT CHECK (embedding_status IN ('in_progress', 'success', 'failure', 'cancelled')),
        embedding_taskId TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notes_vault_filename ON notes(vaultId, fileName);
      CREATE INDEX IF NOT EXISTS idx_notes_reasoning ON notes(reasoningId);
      CREATE INDEX IF NOT EXISTS idx_reasonings_vault_filename ON reasonings(vaultId, fileName);
      CREATE INDEX IF NOT EXISTS idx_filenames_vault_fileid ON fileNames(vaultId, fileId);
    `)

    pgliteInstance = pg
    return pg
  } catch (error) {
    console.error("Failed to initialize PgLite database:", error)
    initPromise = null
    throw error
  }
}

export async function getDbInstance(): Promise<PGlite> {
  if (pgliteInstance) {
    return pgliteInstance
  }

  if (!initPromise) {
    initPromise = initializeDb()
  }

  return initPromise
}

// Database operations
export const db = {
  async addVaultWithReference(
    vault: Omit<Vault, "id">,
    references?: {
      handle: FileSystemFileHandle | null
      path: string
      format: "biblatex" | "csl-json"
    },
  ): Promise<string> {
    const pg = await getDbInstance()
    const id = createId()

    try {
      await pg.exec("BEGIN;")

      await pg.query(
        `INSERT INTO vaults (id, name, lastOpened, tree, settings)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          vault.name,
          vault.lastOpened,
          JSON.stringify(vault.tree),
          JSON.stringify(vault.settings),
        ],
      )

      if (references) {
        await pg.query(
          `INSERT INTO references (id, vaultId, handle, format, path, lastModified)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            createId(),
            id,
            references.handle ? JSON.stringify(references.handle) : null,
            references.format,
            references.path,
            new Date(),
          ],
        )
      }

      await pg.exec("COMMIT;")
      return id
    } catch (error) {
      await pg.exec("ROLLBACK;")
      console.error("Failed to add vault with reference:", error)
      throw error
    }
  },

  async saveReasoning(reasoning: Omit<Reasoning, "id"> | Reasoning): Promise<string> {
    const pg = await getDbInstance()
    const reasoningId = "id" in reasoning ? reasoning.id : createId()

    try {
      // We need to convert arrays/objects to JSON strings
      const noteIdsJson = JSON.stringify(reasoning.noteIds)
      const steeringJson = reasoning.steering ? JSON.stringify(reasoning.steering) : null

      await pg.query(
        `INSERT INTO reasonings (id, fileName, vaultId, content, noteIds, createdAt, duration, steering)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
         fileName = $2, content = $4, noteIds = $5, duration = $7, steering = $8`,
        [
          reasoningId,
          reasoning.fileName,
          reasoning.vaultId,
          reasoning.content,
          noteIdsJson,
          reasoning.createdAt,
          reasoning.duration,
          steeringJson,
        ],
      )

      return reasoningId
    } catch (error) {
      console.error("Failed to save reasoning:", error)
      throw error
    }
  },

  async indexFileName(fileName: string, fileId: string, vaultId: string): Promise<string> {
    const pg = await getDbInstance()

    try {
      // Check if entry already exists
      const existingResult = await pg.query(
        `SELECT id, fileName FROM fileNames WHERE vaultId = $1 AND fileId = $2`,
        [vaultId, fileId],
      )

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0]
        if (existing.fileName !== fileName) {
          await pg.query(`UPDATE fileNames SET fileName = $1 WHERE id = $2`, [
            fileName,
            existing.id,
          ])
        }
        return existing.id
      }

      // Create new entry
      const id = createId()
      await pg.query(
        `INSERT INTO fileNames (id, fileName, fileId, vaultId, embedding_status, embedding_taskId)
         VALUES ($1, $2, $3, $4, NULL, NULL)`,
        [id, fileName, fileId, vaultId],
      )

      return id
    } catch (error) {
      console.error("Failed to index file name:", error)
      throw error
    }
  },

  async getFileIdByName(fileName: string, vaultId: string): Promise<string | undefined> {
    const pg = await getDbInstance()

    try {
      const result = await pg.query(
        `SELECT fileId FROM fileNames WHERE fileName = $1 AND vaultId = $2 LIMIT 1`,
        [fileName, vaultId],
      )

      return result.rows.length > 0 ? result.rows[0].fileId : undefined
    } catch (error) {
      console.error("Failed to get file ID by name:", error)
      throw error
    }
  },

  async updateFileEmbeddingStatus(
    vaultId: string,
    fileId: string,
    status: Note["embedding"]["status"],
    taskId?: string,
  ): Promise<void> {
    const pg = await getDbInstance()

    try {
      const result = await pg.query(
        `SELECT id FROM fileNames WHERE vaultId = $1 AND fileId = $2 LIMIT 1`,
        [vaultId, fileId],
      )

      if (result.rows.length > 0) {
        await pg.query(
          `UPDATE fileNames SET embedding_status = $1, embedding_taskId = $2 WHERE id = $3`,
          [status, taskId || null, result.rows[0].id],
        )
        console.debug(`Updated file embedding status for ${vaultId}/${fileId} to ${status}`)
      } else {
        console.warn(`Could not find file index for ${vaultId}/${fileId} to update status.`)
      }
    } catch (error) {
      console.error("Failed to update file embedding status:", error)
      throw error
    }
  },
}

// React Context for Database
type DbContextType = {
  db: typeof db
  isReady: boolean
}

const DbContext = createContext<DbContextType | null>(null)

export function DbProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    getDbInstance()
      .then(() => setIsReady(true))
      .catch((err) => console.error("Failed to initialize database:", err))
  }, [])

  return <DbContext.Provider value={{ db, isReady }}>{children}</DbContext.Provider>
}

export function useDb() {
  const context = useContext(DbContext)
  if (!context) {
    throw new Error("useDb must be used within a DbProvider")
  }
  return context
}
