import { createId } from "@paralleldrive/cuid2"
import { minimatch } from "minimatch"

import type { FileSystemTreeNode, FileSystemTreeNodeDb, Vault } from "@/db/interfaces"

// Define the FlattenedFileMapping type
export type FlattenedFileMapping = Map<string, { name: string; path: string }>

// Define the state interface for the vault reducer
export interface VaultState {
  vaults: Vault[]
  activeVaultId: string | null
  isLoading: boolean
  flattenedFileIds: FlattenedFileMapping
}

// Define the action types
export type VaultAction =
  | { type: "SET_VAULTS"; vaults: Vault[] }
  | { type: "SET_ACTIVE_VAULT_ID"; id: string | null }
  | { type: "ADD_VAULT"; vault: Vault }
  | { type: "UPDATE_VAULT"; vault: Vault }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "UPDATE_FLATTENED_IDS" }

// Initial state for the reducer
export const initialVaultState: VaultState = {
  vaults: [],
  activeVaultId: null,
  isLoading: true,
  flattenedFileIds: new Map(),
}

// Helper function to generate flattened file IDs
const generateFlattenedFileIds = (vaults: Vault[]): FlattenedFileMapping => {
  const map: FlattenedFileMapping = new Map()

  const processNode = (node: FileSystemTreeNode) => {
    if (node.kind === "file") map.set(node.id, { name: node.name, path: node.path })
    node.children?.forEach(processNode)
  }

  for (const vault of vaults) {
    if (vault.tree) vault.tree.children?.forEach(processNode)
  }

  return map
}

// The reducer function
export function vaultReducer(state: VaultState, action: VaultAction): VaultState {
  switch (action.type) {
    case "SET_VAULTS":
      return {
        ...state,
        vaults: action.vaults,
        flattenedFileIds: generateFlattenedFileIds(action.vaults),
      }
    case "SET_ACTIVE_VAULT_ID":
      return {
        ...state,
        activeVaultId: action.id,
      }
    case "ADD_VAULT":
      const newVaults = [...state.vaults, action.vault]
      return {
        ...state,
        vaults: newVaults,
        flattenedFileIds: generateFlattenedFileIds(newVaults),
      }
    case "UPDATE_VAULT":
      const updatedVaults = state.vaults.map((v) => (v.id === action.vault.id ? action.vault : v))
      return {
        ...state,
        vaults: updatedVaults,
        flattenedFileIds: generateFlattenedFileIds(updatedVaults),
      }
    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.isLoading,
      }
    case "UPDATE_FLATTENED_IDS":
      return {
        ...state,
        flattenedFileIds: generateFlattenedFileIds(state.vaults),
      }
    default:
      return state
  }
}

// Define constants for directory processing
export const CHUNK_SIZE = 5
export const PROCESS_DELAY = 1

// Helper function to process a directory
export async function processDirectory(
  handle: FileSystemDirectoryHandle,
  ignorePatterns: string[],
  parentNode?: FileSystemTreeNode,
): Promise<FileSystemTreeNode> {
  const currentNode = parentNode || {
    name: handle.name,
    extension: "",
    id: createId(),
    kind: "directory",
    handle,
    children: [],
    isOpen: false,
    path: "/",
  }

  if (parentNode) currentNode.children = []

  let processedCount = 0

  for await (const entry of handle.values()) {
    const shouldIgnore = ignorePatterns.some((p) => minimatch(entry.name, p))

    if (shouldIgnore) continue

    if (entry.kind === "file") {
      const match = entry.name.match(/^(.+?)(\.[^.]*)?$/)
      const baseName = match?.[1] || entry.name
      const extension = match?.[2] || ""

      currentNode.children?.push({
        name: baseName,
        extension: extension.replace(/^\./, ""),
        id: createId(),
        kind: "file",
        handle: entry as FileSystemFileHandle,
        path: `${currentNode.path}${baseName}`,
      })
    } else if (entry.kind === "directory") {
      const dirNode: FileSystemTreeNode = {
        name: entry.name,
        extension: "",
        id: createId(),
        kind: "directory",
        handle: entry as FileSystemDirectoryHandle,
        children: [],
        isOpen: false,
        path: `${currentNode.path}${entry.name}/`,
      }
      currentNode.children?.push(dirNode)
      await processDirectory(entry as FileSystemDirectoryHandle, ignorePatterns, dirNode)
    }

    if (++processedCount % CHUNK_SIZE === 0) {
      await new Promise((resolve) => setTimeout(resolve, PROCESS_DELAY))
    }
  }

  currentNode.children?.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
  )

  // Filter out directory nodes with empty children
  if (currentNode.children) {
    currentNode.children = currentNode.children.filter(
      (child) => child.kind !== "directory" || (child.children && child.children.length > 0),
    )
  }

  return currentNode
}

// Convert runtime tree to DB tree by removing handles
export function treeToDbTree(tree: FileSystemTreeNode): FileSystemTreeNodeDb {
  const { children, ...rest } = tree
  delete rest.handle
  const dbTree: FileSystemTreeNodeDb = {
    ...rest,
    children: children?.map(treeToDbTree),
  }
  return dbTree
}

// Helper function to verify handle permissions
export async function verifyHandle(handle: FileSystemHandle): Promise<boolean> {
  try {
    // For directory handles
    if ("getDirectoryHandle" in handle) {
      if (
        (await (handle as FileSystemDirectoryHandle).queryPermission({ mode: "read" })) ===
        "granted"
      )
        return true
      return (
        (await (handle as FileSystemDirectoryHandle).requestPermission({ mode: "read" })) ===
        "granted"
      )
    }
    // For file handles
    else if ("getFile" in handle) {
      try {
        await (handle as FileSystemFileHandle).getFile()
        return true
      } catch {
        return false
      }
    }
    return false
  } catch {
    return false
  }
}
