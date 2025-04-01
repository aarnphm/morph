// use inconjunction with DB for nicer handling

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

export type FileSystemHandleType = FileSystemFileHandle | FileSystemDirectoryHandle

// This represents the DB-stored version (without actual handles)
export interface FileSystemTreeNodeDb {
  name: string
  extension: string
  kind: "file" | "directory"
  id: string
  handleId?: string
  children?: FileSystemTreeNodeDb[]
  isOpen?: boolean
  path: string
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
}

// Runtime version of vault
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

// DB version of reference
export interface ReferenceDb {
  id: string
  vaultId: string
  fileId: string
  handleId: string
  format: "biblatex" | "csl-json"
  path: string
  lastModified: Date
}

// Runtime version of reference
export interface Reference extends Omit<ReferenceDb, "handleId"> {
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
