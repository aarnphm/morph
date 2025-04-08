import { createId } from "@paralleldrive/cuid2"
import Dexie from "dexie"
import { useCallback } from "react"

import { FileSystemHandleType } from "@/db/interfaces"

// Define the database schema
class HandleDatabase extends Dexie {
  // Define tables
  handles!: Dexie.Table<
    {
      id: string
      vaultId: string
      fileId: string
      handle: FileSystemHandleType
    },
    string
  >

  constructor() {
    super("morph-fs-handles")

    // Define schema
    this.version(1).stores({
      handles: "&id, vaultId, fileId, [vaultId+fileId]", // Primary key and indexed properties
    })

    // Define types for tables
    this.handles = this.table("handles")
  }
}

// Initialize the database
export const dbHandle = new HandleDatabase()

// Custom hook for handling file system handles
export default function useFsHandles() {
  // Store a file system handle in IndexedDB
  const storeHandle = useCallback(
    async (
      id: string,
      vaultId: string,
      fileId: string,
      handle: FileSystemHandleType,
    ): Promise<void> => {
      try {
        await dbHandle.handles.put({
          id,
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

  // Retrieve a file system handle from IndexedDB
  const getHandle = useCallback(async (id: string): Promise<FileSystemHandleType | null> => {
    try {
      const record = await dbHandle.handles.get(id)
      return record?.handle || null
    } catch (error) {
      console.error("Error retrieving handle from IndexedDB:", error)
      return null
    }
  }, [])

  // Get all handles for a vault
  const getVaultHandles = useCallback(
    async (
      vaultId: string,
    ): Promise<Array<{ id: string; fileId: string; handle: FileSystemHandle }>> => {
      try {
        const records = await dbHandle.handles.where("vaultId").equals(vaultId).toArray()
        return records.map(({ id, fileId, handle }) => ({ id, fileId, handle }))
      } catch (error) {
        console.error("Error retrieving vault handles from IndexedDB:", error)
        return []
      }
    },
    [],
  )

  // Delete a handle
  const deleteHandle = useCallback(async (id: string): Promise<void> => {
    try {
      await dbHandle.handles.delete(id)
    } catch (error) {
      console.error("Error deleting handle from IndexedDB:", error)
    }
  }, [])

  // Delete all handles for a vault
  const deleteVaultHandles = useCallback(async (vaultId: string): Promise<void> => {
    try {
      await dbHandle.handles.where("vaultId").equals(vaultId).delete()
    } catch (error) {
      console.error("Error deleting vault handles from IndexedDB:", error)
    }
  }, [])

  return {
    storeHandle,
    getHandle,
    getVaultHandles,
    deleteHandle,
    deleteVaultHandles,
  }
}
