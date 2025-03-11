import { useState, useCallback } from "react"
import usePersistedSettings from "@/hooks/use-persisted-settings"
import { minimatch } from "minimatch"
import { createId } from "@paralleldrive/cuid2"
import { db, type Vault, type Reference, type FileSystemTreeNode } from "@/db"

const VAULT_IDS_KEY = "morph:vault-ids"
const CHUNK_SIZE = 5
const PROCESS_DELAY = 1

// TODO: refactor with Reducer and better used with @/context/vault-context
export default function useVaults() {
  const [vaults, setVaults] = useState<Vault[]>([])
  const [references, setReferences] = useState<Map<string, Reference[]>>(new Map())
  const { defaultSettings } = usePersistedSettings()

  const processDirectory = useCallback(
    async (
      handle: FileSystemDirectoryHandle,
      ignorePatterns: string[],
      parentNode?: FileSystemTreeNode,
    ): Promise<FileSystemTreeNode> => {
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
    },
    [],
  )

  const updateVaultReferences = useCallback(async (vault: Vault) => {
    try {
      const refs = await db.references.where("vaultId").equals(vault.id).toArray()
      setReferences((prev) => new Map(prev).set(vault.id, refs))
    } catch (error) {
      console.error("Error loading references for vault:", error)
    }
  }, [])

  const addVault = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      try {
        const existing = vaults.find((v) => v.name === handle.name)
        if (existing) {
          const updatedVault = { ...existing, lastOpened: new Date() }
          await db.vaults.put(updatedVault)
          setVaults((prev) => prev.map((v) => (v.id === existing.id ? updatedVault : v)))
          return updatedVault
        }

        const tree = await processDirectory(handle, defaultSettings.ignorePatterns)

        const id = await db.addVaultWithReference({
          name: handle.name,
          lastOpened: new Date(),
          tree,
        })

        const newVault = await db.vaults.get(id)
        if (!newVault) throw new Error("Failed to create vault")

        setVaults((prev) => [...prev, newVault])
        localStorage.setItem(
          VAULT_IDS_KEY,
          JSON.stringify([...vaults.map((v) => v.id), newVault.id]),
        )
        return newVault
      } catch (error) {
        console.error("Error adding vault:", error)
        return null
      }
    },
    [vaults, defaultSettings, processDirectory],
  )

  const refreshVault = useCallback(
    async (vaultId: string) => {
      const vault = vaults.find((v) => v.id === vaultId)
      if (!vault) return

      try {
        const newTree = await processDirectory(
          vault.tree.handle as FileSystemDirectoryHandle,
          vault.config.ignorePatterns,
        )
        const updatedVault = { ...vault, tree: newTree }

        await db.vaults.put(updatedVault)
        setVaults((prev) => prev.map((v) => (v.id === vaultId ? updatedVault : v)))
      } catch (error) {
        console.error("Error refreshing vault:", error)
      }
    },
    [vaults, processDirectory],
  )

  const updateReference = useCallback(
    async (
      vault: Vault,
      handle: FileSystemFileHandle,
      format: "biblatex" | "csl-json",
      path: string,
    ) => {
      try {
        const existingRef = await db.references
          .where("[vaultId+format]")
          .equals([vault.id, format])
          .first()

        if (existingRef) return

        const referenceItem: Reference = {
          id: createId(),
          vaultId: vault.id,
          handle,
          format,
          path,
          lastModified: new Date(),
        }

        await db.references.add(referenceItem)
        await updateVaultReferences(vault)
      } catch (error) {
        console.error("Error updating reference:", error)
        throw error
      }
    },
    [updateVaultReferences],
  )

  const loadVaults = useCallback(async () => {
    async function hydrateTree(vault: Vault): Promise<FileSystemTreeNode> {
      if (!vault.tree) throw new Error("No tree data available")

      return processDirectory(
        vault.tree.handle as FileSystemDirectoryHandle,
        vault.config.ignorePatterns,
        {
          ...vault.tree,
        },
      )
    }

    try {
      const vaultIds = JSON.parse(localStorage.getItem(VAULT_IDS_KEY) || "[]")
      const loadedVaults = await Promise.all(
        vaultIds.map(async (id: string) => {
          const vault = await db.vaults.get(id)
          if (vault) {
            await verifyHandle(vault.tree.handle)
            const tree = await hydrateTree(vault)
            await updateVaultReferences(vault)
            return { ...vault, tree }
          }
          return null
        }),
      )
      setVaults(loadedVaults.filter(Boolean) as Vault[])
    } catch {}
  }, [processDirectory, updateVaultReferences])

  return {
    vaults,
    setVaults,
    references,
    addVault,
    processDirectory,
    refreshVault,
    loadVaults,
    getAllVaults: useCallback(async () => {
      try {
        return await db.vaults.toArray()
      } catch (error) {
        console.error("Error fetching all vaults:", error)
        return []
      }
    }, []),
    updateReference,
  }
}

async function verifyHandle(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await handle.queryPermission({ mode: "read" })) === "granted") return true
  return (await handle.requestPermission({ mode: "read" })) === "granted"
}
