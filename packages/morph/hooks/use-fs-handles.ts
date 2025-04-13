import Dexie from "dexie"
import { useCallback } from "react"

import type { FileSystemHandleType } from "@/db/interfaces"

// Define the database schema
class HandleDatabase extends Dexie {
  handles!: Dexie.Table<
    {
      vaultId: string
      fileId: string
      handle: FileSystemHandleType
    },
    [string, string]
  >

  constructor() {
    super("morph-fs-handles")

    this.version(1).stores({
      // Use a compound primary key [vaultId+fileId]
      // Keep vaultId index for getVaultHandles
      handles: "&[vaultId+fileId], vaultId",
    })

    this.handles = this.table("handles")
  }
}

// Initialize the database
export const dbHandle = new HandleDatabase()

// Custom hook for handling file system handles
export default function useFsHandles() {
  const storeHandle = useCallback(
    async (
      vaultId: string,
      fileId: string,
      handle: FileSystemHandleType,
    ): Promise<void> => {
      try {
        await dbHandle.handles.put({
          vaultId,
          fileId,
          handle,
        })
      } catch (error) {
        console.error("Error storing handle in IndexedDB:", error)
        throw error
      }
    },
    [],
  )

  // Retrieve a file system handle using vaultId and fileId
  const getHandle = useCallback(
    async (vaultId: string, fileId: string): Promise<FileSystemHandleType | null> => {
      try {
        const record = await dbHandle.handles.get([vaultId, fileId])
        if (!record) {
          console.warn(`[FS Handles] Handle not found for vault ${vaultId}, file ${fileId}`)
        }
        return record?.handle || null
      } catch (error) {
        console.error("Error retrieving handle from IndexedDB:", error)
        return null
      }
    },
    [],
  )

  return {
    storeHandle,
    getHandle,
  }
}
