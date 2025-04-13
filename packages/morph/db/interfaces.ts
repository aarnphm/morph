// use inconjunction with DB for nicer handling

export interface Settings {
  vimMode: boolean
  tabSize: number
  toggleEditMode: string
  toggleNotes: string
  ignorePatterns: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  vimMode: false,
  tabSize: 2,
  toggleEditMode: "e",
  toggleNotes: "i",
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
}

export type FileSystemHandleType = FileSystemFileHandle | FileSystemDirectoryHandle

// This represents the DB-stored version (without actual handles)
export interface FileSystemTreeNodeDb {
  name: string
  extension: string
  kind: "file" | "directory"
  id: string // Persistent path-based ID (e.g., vaultId:/path/to/item)
  children?: FileSystemTreeNodeDb[]
  isOpen?: boolean
  path: string // Relative path within the vault
}

// This is the runtime version with actual handles
export interface FileSystemTreeNode extends Omit<FileSystemTreeNodeDb, "children"> {
  handle?: FileSystemHandleType
  children?: FileSystemTreeNode[]
}

// DB version of vault
export interface VaultDb {
  id: string
  name: string
  lastOpened: Date
  tree: FileSystemTreeNodeDb
  settings: Settings
  rootPath: string
}

// Runtime version of vault
export interface Vault {
  id: string
  name: string
  lastOpened: Date
  tree: FileSystemTreeNode
  settings: Settings
  rootPath: string
}

export interface FileIndex {
  id: string
  name: string
  extension: string
  vaultId: string
  embeddingStatus: Note["embeddingStatus"]
  embeddingTaskId?: Note["embeddingTaskId"]
}

// DB version of reference
export interface ReferenceDb {
  id: string
  vaultId: string
  fileId: string
  format: "biblatex" | "csl-json"
  path: string
  lastModified: Date
}

// Runtime version of reference
export interface Reference extends ReferenceDb {
  handle: FileSystemFileHandle
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
  fileId: string
  vaultId: string
  reasoningId?: string
  createdAt: Date
  accessedAt?: Date
  dropped?: boolean
  steering?: Steering | null
  embeddingStatus: "in_progress" | "success" | "failure" | "cancelled" | null
  embeddingTaskId: string | null
}

export interface Reasoning {
  id: string
  content: string
  fileId: string
  vaultId: string
  noteIds: string[]
  createdAt: Date
  accessedAt: Date
  duration: number
  steering: Steering
}

export interface StreamingNote {
  id: string
  content: string
  color: string
  isComplete: boolean
  isScanComplete?: boolean
}

export interface ReasoningHistory {
  id: string
  content: string
  timestamp: Date
  noteIds: string[]
  reasoningElapsedTime: number
  authors?: string[]
  tonality?: Record<string, number>
  temperature?: number
  numSuggestions?: number
}
