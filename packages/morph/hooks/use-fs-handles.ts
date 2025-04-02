import Dexie, { type Table } from "dexie"
import { useCallback } from "react"

import { FileSystemHandleType, FileSystemFileHandle } from "@/db/interfaces"

// Define the structure for the reference file table entry
interface ReferenceFile {
  id: string
  vaultId: string
  name: string
  handle: FileSystemFileHandle
}

// Define the database schema
class HandleDatabase extends Dexie {
  // Define tables
  handles!: Table<
    {
      id: string
      vaultId: string
      kind: "file" | "directory"
      handle: FileSystemHandleType
    },
    string
  >
  referenceFiles!: Table<ReferenceFile, string>

  constructor() {
    super("morph-fs-handles")

    // Define schema version 2
    this.version(2).stores({
      handles: "&id, vaultId, kind",
      referenceFiles: "&id, vaultId, name",
    }).upgrade(tx => {
      console.log("Upgrading morph-fs-handles DB to version 2")
    })

    // Define schema version 1 (for backward compatibility during upgrade)
    this.version(1).stores({
      handles: "&id, vaultId, fileId, [vaultId+fileId]",
    })

    // Define types for tables
    this.handles = this.table("handles")
    this.referenceFiles = this.table("referenceFiles")
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
      handle: FileSystemHandleType,
    ): Promise<void> => {
      try {
        await dbHandle.handles.put({
          id: `${vaultId}/${id}`,
          vaultId,
          kind: handle.kind,
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
    ): Promise<Array<{ id: string; kind: "file" | "directory"; handle: FileSystemHandleType }>> => {
      try {
        const records = await dbHandle.handles.where("vaultId").equals(vaultId).toArray()
        return records.map(({ id, kind, handle }) => ({ id, kind, handle }))
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

  // Store a reference file in the database
  const storeReferenceFile = useCallback(
    async (vaultId: string, name: string, handle: FileSystemFileHandle): Promise<void> => {
      try {
        const id = `${vaultId}/${name}`
        await dbHandle.referenceFiles.put({
          id,
          vaultId,
          name,
          handle,
        })
        console.log(`Stored reference file handle: ${name} for vault ${vaultId}`)
      } catch (error) {
        console.error("Error storing reference file handle:", error)
        throw error
      }
    },
    [],
  )

  // Retrieve reference files for a vault
  const getReferenceFilesByVault = useCallback(
    async (vaultId: string): Promise<ReferenceFile[]> => {
      try {
        return await dbHandle.referenceFiles.where("vaultId").equals(vaultId).toArray()
      } catch (error) {
        console.error("Error retrieving reference files by vault:", error)
        return []
      }
    },
    [],
  )

  // Delete reference files for a vault
  const deleteReferenceFilesByVault = useCallback(async (vaultId: string): Promise<void> => {
    try {
      await dbHandle.referenceFiles.where("vaultId").equals(vaultId).delete()
      console.log(`Deleted reference files for vault ${vaultId}`)
    } catch (error) {
      console.error("Error deleting reference files for vault:", error)
    }
  }, [])

  return {
    storeHandle,
    getHandle,
    getVaultHandles,
    deleteHandle,
    deleteVaultHandles,
    storeReferenceFile,
    getReferenceFilesByVault,
    deleteReferenceFilesByVault,
  }
}

// Export utility function to scan and store reference files
// This can be called from outside the hook, e.g., in addVault
export async function scanAndStoreReferenceFiles(vaultId: string, directoryHandle: FileSystemDirectoryHandle): Promise<void> {
  const referenceFileNames = ["references.bib", "Reference.bib", "library.bib"] // Add more patterns if needed
  try {
    for await (const entry of directoryHandle.values()) {
      if (entry.kind === "file" && referenceFileNames.includes(entry.name)) {
        const id = `${vaultId}/${entry.name}`
        await dbHandle.referenceFiles.put({
          id,
          vaultId,
          name: entry.name,
          handle: entry, // entry is FileSystemFileHandle here
        })
        console.log(`Found and stored reference file: ${entry.name} for vault ${vaultId}`)
      }
      // Optionally recurse into subdirectories if needed
      // if (entry.kind === 'directory') {
      //   await scanAndStoreReferenceFiles(vaultId, entry); // Might need path adjustments for ID
      // }
    }
  } catch (error) {
    console.error(`Error scanning vault ${vaultId} for reference files:`, error)
  }
}
