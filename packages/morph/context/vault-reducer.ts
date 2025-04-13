import { createId } from "@paralleldrive/cuid2"
import { minimatch } from "minimatch"

import type {
  FileSystemHandleType,
  FileSystemTreeNode,
  FileSystemTreeNodeDb,
  Vault,
} from "@/db/interfaces"

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
  | { type: "ADD_FILE_NODE"; vaultId: string; node: FileSystemTreeNode }

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
    if (node.kind === "file") {
      // Use the node's persistent ID and path
      map.set(node.id, { name: node.name, path: node.path })
    }
    node.children?.forEach(processNode)
  }

  for (const vault of vaults) {
    if (vault.tree) {
      // Start processing from the root node's children
      vault.tree.children?.forEach(processNode)
    }
  }

  return map
}

// Helper function to insert a node into the tree structure
const insertNodeIntoTree = (
  tree: FileSystemTreeNode,
  newNode: FileSystemTreeNode,
): FileSystemTreeNode => {
  const pathSegments = newNode.path.split("/").filter(Boolean)
  let currentNode = tree

  for (let i = 0; i < pathSegments.length - 1; i++) {
    const segment = pathSegments[i]
    let nextNode = currentNode.children?.find(
      (child) => child.kind === "directory" && child.name === segment,
    )

    // If directory doesn't exist, create it (though this shouldn't happen for ADD_FILE_NODE)
    if (!nextNode) {
      console.warn(`Directory ${segment} not found in path ${newNode.path}, creating placeholder.`)
      nextNode = {
        name: segment,
        extension: "",
        id: `${tree.id.split(":")[0]}:${currentNode.path}${segment}/`, // Generate ID based on path
        kind: "directory",
        path: `${currentNode.path}${segment}/`,
        children: [],
        isOpen: false,
      }
      currentNode.children = [...(currentNode.children || []), nextNode].sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
      )
    }
    currentNode = nextNode
  }

  // Add or update the file node
  const fileName = pathSegments[pathSegments.length - 1]
  const existingNodeIndex = currentNode.children?.findIndex(
    (child) => child.kind === "file" && child.name === fileName,
  )

  if (existingNodeIndex !== undefined && existingNodeIndex !== -1) {
    // Update existing node
    currentNode.children![existingNodeIndex] = newNode
  } else {
    // Add new node
    currentNode.children = [...(currentNode.children || []), newNode].sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
    )
  }

  return { ...tree } // Return a new tree object to ensure state update
}

// The reducer function
export function vaultReducer(state: VaultState, action: VaultAction): VaultState {
  switch (action.type) {
    case "SET_VAULTS": {
      const newFlattenedIds = generateFlattenedFileIds(action.vaults)
      return {
        ...state,
        vaults: action.vaults,
        flattenedFileIds: newFlattenedIds,
      }
    }
    case "SET_ACTIVE_VAULT_ID":
      return {
        ...state,
        activeVaultId: action.id,
      }
    case "ADD_VAULT": {
      const newVaults = [...state.vaults, action.vault]
      const newFlattenedIds = generateFlattenedFileIds(newVaults)
      return {
        ...state,
        vaults: newVaults,
        flattenedFileIds: newFlattenedIds,
      }
    }
    case "UPDATE_VAULT": {
      const updatedVaults = state.vaults.map((v) => (v.id === action.vault.id ? action.vault : v))
      const newFlattenedIds = generateFlattenedFileIds(updatedVaults)
      return {
        ...state,
        vaults: updatedVaults,
        flattenedFileIds: newFlattenedIds,
      }
    }
    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.isLoading,
      }
    case "UPDATE_FLATTENED_IDS": {
      const newFlattenedIds = generateFlattenedFileIds(state.vaults)
      return {
        ...state,
        flattenedFileIds: newFlattenedIds,
      }
    }
    case "ADD_FILE_NODE": {
      const vaultIndex = state.vaults.findIndex((v) => v.id === action.vaultId)
      if (vaultIndex === -1) return state // Vault not found

      const targetVault = state.vaults[vaultIndex]
      const updatedTree = insertNodeIntoTree(targetVault.tree, action.node)
      const updatedVault = { ...targetVault, tree: updatedTree }
      const updatedVaults = [
        ...state.vaults.slice(0, vaultIndex),
        updatedVault,
        ...state.vaults.slice(vaultIndex + 1),
      ]
      const newFlattenedIds = generateFlattenedFileIds(updatedVaults)

      return {
        ...state,
        vaults: updatedVaults,
        flattenedFileIds: newFlattenedIds,
      }
    }
    default:
      return state
  }
}

// Define constants for directory processing
export const CHUNK_SIZE = 5
export const PROCESS_DELAY = 1

// Helper function to generate a persistent ID based on vault and path
function generatePersistentId(vaultId: string, relativePath: string): string {
  // Simple concatenation, but could use hashing if paths become extremely long
  // Ensure consistent path separators (e.g., always use '/')
  const normalizedPath = relativePath.replace(/\\\\/g, "/")
  return `${vaultId}:${normalizedPath}`
}

/**
 * Processes a directory recursively to build a FileSystemTreeNode structure.
 * Generates persistent IDs based on the vaultId and relative path.
 *
 * @param vaultId - The ID of the vault being processed.
 * @param handle - The FileSystemDirectoryHandle to process.
 * @param ignorePatterns - Patterns for files/directories to ignore.
 * @param currentPath - The relative path accumulated so far (used internally).
 * @returns A promise resolving to the FileSystemTreeNode representing the directory.
 */
export async function processDirectory(
  vaultId: string,
  handle: FileSystemDirectoryHandle,
  ignorePatterns: string[],
  currentPath: string = "/", // Start with root path
): Promise<FileSystemTreeNode> {
  const nodeId = generatePersistentId(vaultId, currentPath)
  const node: FileSystemTreeNode = {
    name: handle.name,
    extension: "",
    id: nodeId,
    kind: "directory",
    handle: handle,
    children: [],
    isOpen: false,
    path: currentPath,
  }

  let processedCount = 0
  const children: FileSystemTreeNode[] = []

  try {
    for await (const entry of handle.values()) {
      const entryPath = `${currentPath}${entry.name}${entry.kind === "directory" ? "/" : ""}`
      const shouldIgnore = ignorePatterns.some((p) => minimatch(entryPath, p, { matchBase: true })) // Use matchBase for patterns like ".obsidian"

      if (shouldIgnore) {
        // console.debug(`Ignoring: ${entryPath} based on patterns`)
        continue
      }

      if (entry.kind === "file") {
        const match = entry.name.match(/^(.+?)(\.[^.]*)?$/)
        const baseName = match?.[1] || entry.name
        const extension = match?.[2]?.replace(/^\./, "") || "" // Ensure extension has no leading dot
        const fileId = generatePersistentId(vaultId, entryPath)

        children.push({
          name: baseName,
          extension: extension,
          id: fileId,
          kind: "file",
          handle: entry as FileSystemFileHandle,
          path: entryPath,
        })
      } else if (entry.kind === "directory") {
        const dirNode = await processDirectory(
          vaultId,
          entry as FileSystemDirectoryHandle,
          ignorePatterns,
          entryPath, // Pass the updated path
        )
        // Only add directory if it (or its subdirectories) contain files
        if (dirNode.children && dirNode.children.length > 0) {
           children.push(dirNode)
        } else {
            // Check recursively if any subdirectory has children
            const hasDescendantFiles = (node: FileSystemTreeNode): boolean => {
                if (node.kind === 'file') return true;
                return node.children?.some(hasDescendantFiles) ?? false;
            };
            if (hasDescendantFiles(dirNode)) {
                 children.push(dirNode);
            }
        }
      }

      if (++processedCount % CHUNK_SIZE === 0) {
        await new Promise((resolve) => setTimeout(resolve, PROCESS_DELAY))
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${currentPath}:`, error)
    // Decide how to handle errors, maybe return partially processed node?
  }

  node.children = children.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
  )

  return node
}

// Convert runtime tree to DB tree by removing handles
export function treeToDbTree(tree: FileSystemTreeNode): FileSystemTreeNodeDb {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { handle, children, ...rest } = tree // Destructure handle out
  const dbTree: FileSystemTreeNodeDb = {
    ...rest,
    // Recursively convert children
    ...(children && children.length > 0 && { children: children.map(treeToDbTree) }),
  }
  return dbTree
}

// Helper function to verify handle permissions
export async function verifyHandle(handle: FileSystemHandle): Promise<boolean> {
  try {
    // Assert handle type for permission methods
    const specificHandle = handle as FileSystemDirectoryHandle | FileSystemFileHandle
    const options = { mode: "readwrite" as FileSystemPermissionMode } // Use standard PermissionMode

    // Check current permission status
    if ((await specificHandle.queryPermission(options)) === "granted") {
      return true
    }
    // Request permission if not granted
    if ((await specificHandle.requestPermission(options)) === "granted") {
      return true
    }

    // Fallback check for read-only if readwrite fails
    const readOptions = { mode: "read" as PermissionMode } // Use standard PermissionMode
    if ((await specificHandle.queryPermission(readOptions)) === "granted") {
      console.warn(`Read-write permission denied for ${handle.name}, obtained read-only.`)
      return true
    }
    if ((await specificHandle.requestPermission(readOptions)) === "granted") {
      console.warn(`Read-write permission denied for ${handle.name}, obtained read-only after request.`)
      return true
    }

    console.warn(`Permission denied for handle: ${handle.name}`)
    return false
  } catch (error) {
    console.error(`Error verifying permission for handle ${handle.name}:`, error)
    return false
  }
}

// Function to reconstruct the tree with handles from DB data and stored handles
export async function reconstructTreeWithHandles(
  vaultId: string,
  dbTree: FileSystemTreeNodeDb,
  // Use the imported FileSystemHandleType
  getHandleFn: (vaultId: string, fileId: string) => Promise<FileSystemHandleType | null>,
): Promise<FileSystemTreeNode | null> {
  const handle = await getHandleFn(vaultId, dbTree.id)
  if (!handle && dbTree.kind === "directory") {
    // For directories, we might still be able to reconstruct children
    console.warn(
      `Handle not found for directory: ${dbTree.path} (${dbTree.id}), attempting to reconstruct children.`,
    )
  } else if (!handle) {
    console.error(`Handle not found for node: ${dbTree.path} (${dbTree.id})`)
    return null // Cannot reconstruct if file handle is missing
  }

  const runtimeNode: FileSystemTreeNode = {
    ...dbTree,
    handle: handle || undefined, // Assign handle if found
    children: [], // Initialize children array
  }

  if (dbTree.children && dbTree.children.length > 0) {
    const childPromises = dbTree.children.map((childDb) =>
      reconstructTreeWithHandles(vaultId, childDb, getHandleFn),
    )
    const childrenResults = await Promise.all(childPromises)
    runtimeNode.children = childrenResults.filter(Boolean) as FileSystemTreeNode[]
  }

  return runtimeNode
}
