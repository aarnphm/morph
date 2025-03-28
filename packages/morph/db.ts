import Dexie, { type Table } from "dexie"
import { createId } from "@paralleldrive/cuid2"

// Define interfaces
export interface Vault {
  id: string
  name: string
  lastOpened: Date
  tree: FileSystemTreeNode
  settings: Settings
}

export interface Settings {
  vimMode: boolean
  tabSize: number
  ignorePatterns: string[]
  editModeShortcut: string
  notePanelShortcut: string
  citation: {
    enabled: boolean
    format: "biblatex" | "csl-json"
    databasePath?: string
  }
}

export interface FileSystemTreeNode {
  name: string
  extension: string
  kind: "file" | "directory"
  id: string
  handle: FileSystemFileHandle | FileSystemDirectoryHandle
  children?: FileSystemTreeNode[]
  isOpen?: boolean
  path: string
}

export interface Reference {
  id: string
  vaultId: string
  handle: FileSystemFileHandle
  format: "biblatex" | "csl-json"
  path: string
  lastModified: Date
}

export interface Note {
  id: string
  content: string
  color: string
  fileId: string
  vaultId: string
  position?: { x: number; y: number }
  createdAt: Date
  lastModified: Date
  reasoningId?: string
  dropped?: boolean
}

export interface Reasoning {
  id: string
  fileId: string
  vaultId: string
  content: string
  noteIds: string[]
  createdAt: Date
  duration: number
}

export interface FileNameIndex {
  id: string
  fileName: string
  fileId: string
  vaultId: string
}

export class DB extends Dexie {
  vaults!: Table<Vault, string>
  references!: Table<Reference, string>
  notes!: Table<Note, string>
  reasonings!: Table<Reasoning, string>
  fileNames!: Table<FileNameIndex, string>

  constructor() {
    super("morph")

    this.version(1).stores({
      vaults: "&id, name, lastOpened",
      references: "id, vaultId",
      notes: "id, fileId, vaultId, dropped",
      reasonings: "id, fileId, vaultId, createdAt",
      fileNames: "id, fileName, fileId, vaultId",
    })
  }

  async addVaultWithReference(
    vault: Omit<Vault, "id">,
    references?: {
      handle: FileSystemFileHandle | null
      path: string
      format: "biblatex" | "csl-json"
    },
  ): Promise<string> {
    return this.transaction("rw", this.vaults, this.references, async () => {
      const id = createId()
      await this.vaults.add({ ...vault, id })

      // Create associated reference
      await this.references.add({
        id: createId(),
        vaultId: id,
        handle: references?.handle ?? (null as any),
        format: references?.format ?? "biblatex",
        path: references?.path ?? "",
        lastModified: new Date(),
      })

      return id
    })
  }

  async saveReasoning(reasoning: Omit<Reasoning, "id"> | Reasoning): Promise<string> {
    return this.transaction("rw", this.reasonings, async () => {
      // Check if reasoning already has an ID
      const reasoningId = "id" in reasoning ? reasoning.id : createId()

      if ("id" in reasoning) {
        // If reasoning already has an ID, update it
        await this.reasonings.put(reasoning)
      } else {
        // Otherwise add new reasoning with generated ID
        await this.reasonings.add({ ...reasoning, id: reasoningId })
      }

      return reasoningId
    })
  }

  async indexFileName(fileName: string, fileId: string, vaultId: string): Promise<string> {
    return this.transaction("rw", this.fileNames, async () => {
      const id = createId()
      await this.fileNames.add({
        id,
        fileName,
        fileId,
        vaultId,
      })
      return id
    })
  }

  async getFileIdByName(fileName: string, vaultId: string): Promise<string | undefined> {
    const result = await this.fileNames.where({ fileName, vaultId }).first()
    return result?.fileId
  }
}

const db = new DB()

const defaultSettings: Settings = {
  vimMode: false,
  tabSize: 2,
  ignorePatterns: [
    "**/.*",
    "**/node_modules/**",
    ".vercel/**",
    "**/dist/**",
    "__pycache__/**",
    "*.log",
    ".DS_Store",
    ".obsidian", // TODO: support obsidian vault
  ],
  editModeShortcut: "e",
  notePanelShortcut: "i",
  citation: {
    enabled: false,
    format: "biblatex",
  },
}

export { db, defaultSettings }
