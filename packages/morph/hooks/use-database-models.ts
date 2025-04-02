import { useCallback } from "react"

import { processDirectory } from "@/context/vault-reducer"

import useFsHandles from "@/hooks/use-fs-handles"

import { type Reference, type ReferenceDb, type Vault, type VaultDb } from "@/db/interfaces"

/**
 * Hook for converting between database models and runtime models with file handles
 */
export default function useDatabaseModels() {
  const { getHandle } = useFsHandles()

  /**
   * Convert a database vault to a runtime vault with file handles
   */
  const dbVaultToRuntimeVault = useCallback(
    async (dbVault: VaultDb): Promise<Vault | null> => {
      try {
        // Skip if missing tree handleId
        if (!dbVault.tree.handleId) {
          console.error(`Vault ${dbVault.id} missing tree handleId`)
          return null
        }

        // Get the root handle from IndexedDB
        const rootHandle = await getHandle(dbVault.tree.handleId)
        if (!rootHandle || rootHandle.kind !== "directory") {
          console.error(`Vault ${dbVault.id} root handle invalid`)
          return null
        }

        // Process directory to rebuild the tree with handles
        const tree = await processDirectory(
          rootHandle as FileSystemDirectoryHandle,
          dbVault.settings.general.ignorePatterns,
        )

        // Apply handleIds from DB tree
        const updateHandleIds = (runtimeNode: any, dbNode: any) => {
          // Copy handleId if available
          if (dbNode.handleId) {
            runtimeNode.handleId = dbNode.handleId
          }

          // Process children
          if (dbNode.children && runtimeNode.children) {
            for (const rChild of runtimeNode.children) {
              const dbChild = dbNode.children.find((c: any) => c.id === rChild.id)
              if (dbChild) {
                updateHandleIds(rChild, dbChild)
              }
            }
          }
        }

        updateHandleIds(tree, dbVault.tree)

        // Create the runtime vault with handles
        return {
          ...dbVault,
          tree,
        }
      } catch (error) {
        console.error(`Failed to convert vault ${dbVault.id}:`, error)
        return null
      }
    },
    [getHandle],
  )

  /**
   * Convert a database reference to a runtime reference with file handle
   */
  const dbReferenceToRuntimeReference = useCallback(
    async (dbReference: ReferenceDb): Promise<Reference | null> => {
      try {
        // Get the file handle from IndexedDB
        const handle = await getHandle(dbReference.handleId)
        if (!handle || handle.kind !== "file") {
          console.error(`Reference ${dbReference.id} handle invalid`)
          return null
        }

        // Create the runtime reference with handle
        return {
          id: dbReference.id,
          vaultId: dbReference.vaultId,
          fileId: dbReference.fileId,
          handle: handle as FileSystemFileHandle,
          format: dbReference.format,
          path: dbReference.path,
          lastModified: dbReference.lastModified,
        }
      } catch (error) {
        console.error(`Failed to convert reference ${dbReference.id}:`, error)
        return null
      }
    },
    [getHandle],
  )

  return {
    dbVaultToRuntimeVault,
    dbReferenceToRuntimeReference,
  }
}
