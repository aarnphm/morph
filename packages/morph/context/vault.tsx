"use client"

import { client } from "@/db"
import { createId } from "@paralleldrive/cuid2"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react"

import {
  initialVaultState,
  processDirectory,
  treeToDbTree,
  vaultReducer,
} from "@/context/vault-reducer"
import type { FlattenedFileMapping, VaultAction, VaultState } from "@/context/vault-reducer"

import useDatabaseModels from "@/hooks/use-database-models"
import useFsHandles from "@/hooks/use-fs-handles"

import type { FileSystemTreeNode, Vault, VaultDb } from "@/db/interfaces"
import { DEFAULT_SETTINGS } from "@/db/interfaces"
import { files, references, vaults } from "@/db/schema"
import * as schema from "@/db/schema"

const VAULT_IDS_KEY = "morph:vault-ids"

type VaultContextType = VaultState & {
  setActiveVaultId: (id: string | null) => void
  getActiveVault: () => Vault | undefined
  refreshVault: (vaultId: string) => Promise<void>
  addVault: (handle: FileSystemDirectoryHandle) => Promise<Vault | null>
  updateReference: (
    vault: Vault,
    handle: FileSystemFileHandle,
    format: "biblatex" | "csl-json",
    path: string,
  ) => Promise<void>
  dispatch: (action: VaultAction) => void
}

// Create context with default values
const VaultContext = createContext<VaultContextType>({
  ...initialVaultState,
  setActiveVaultId: () => {},
  getActiveVault: () => undefined,
  refreshVault: async () => {},
  addVault: async () => null,
  updateReference: async () => {},
  dispatch: () => {},
})

const db = drizzle({ client, schema })

export function VaultProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(vaultReducer, initialVaultState)
  const { storeHandle, getHandle } = useFsHandles()
  const { dbVaultToRuntimeVault } = useDatabaseModels()

  // Get all vaults from the database
  const getAllVaults = useCallback(async () => {
    try {
      return await db.query.vaults.findMany()
    } catch (error) {
      console.error("Error fetching all vaults:", error)
      return []
    }
  }, [])

  // Set active vault ID
  const setActiveVaultId = useCallback((id: string | null) => {
    dispatch({ type: "SET_ACTIVE_VAULT_ID", id })
    if (id) localStorage.setItem("morph:active-vault", id)
  }, [])

  // Get the active vault
  const getActiveVault = useCallback(() => {
    return state.activeVaultId ? state.vaults.find((v) => v.id === state.activeVaultId) : undefined
  }, [state.activeVaultId, state.vaults])

  // Add a new vault
  const addVault = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      try {
        const existing = state.vaults.find((v) => v.name === handle.name)
        if (existing) {
          const updatedVault = { ...existing, lastOpened: new Date() }

          await db.update(vaults).set({ lastOpened: new Date() }).where(eq(vaults.id, existing.id))

          dispatch({ type: "UPDATE_VAULT", vault: updatedVault })
          return updatedVault
        }

        // Process directory to build the tree
        const tree = await processDirectory(handle, DEFAULT_SETTINGS.general.ignorePatterns)

        // Store the directory handle in IndexedDB
        const treeHandleId = createId()
        await storeHandle(treeHandleId, treeHandleId, "root", handle)

        const addHandleIds = (node: FileSystemTreeNode) => {
          if (node.handle) {
            const nodeHandleId = createId()
            storeHandle(nodeHandleId, treeHandleId, node.id, node.handle).catch((err: any) =>
              console.error("Error storing node handle:", err),
            )
            node.handleId = nodeHandleId
          }
          node.children?.forEach(addHandleIds)
        }
        addHandleIds(tree)

        // Convert tree to DB format (removing actual handles)
        const dbTree = treeToDbTree(tree)

        // Add root tree handle reference
        dbTree.handleId = treeHandleId

        // Insert the new vault into database
        const newVaultId = createId()

        await db.insert(vaults).values({
          id: newVaultId,
          name: handle.name,
          lastOpened: new Date(),
          tree: dbTree,
          settings: DEFAULT_SETTINGS,
        })

        // Check for References.bib file
        let referencesHandle: FileSystemFileHandle | null = null
        let referencesPath = ""
        try {
          referencesHandle = await handle.getFileHandle("References.bib")
          referencesPath = "References.bib"
        } catch (error) {
          console.debug("No References.bib found in vault root")
        }

        // Add reference if it exists
        if (referencesHandle) {
          // Create a file record first
          const fileId = createId()
          await db.insert(files).values({
            id: fileId,
            name: "References",
            extension: "bib",
            vaultId: newVaultId,
            lastModified: new Date(),
            embeddingStatus: "in_progress",
          })

          // Store the reference handle in IndexedDB
          const refHandleId = createId()
          await storeHandle(refHandleId, newVaultId, fileId, referencesHandle)

          // Add the reference to the database
          await db.insert(references).values({
            id: createId(),
            fileId,
            vaultId: newVaultId,
            handleId: refHandleId,
            format: "biblatex",
            path: referencesPath,
            lastModified: new Date(),
          })
        }

        // The vault for state needs the actual handle
        const newVault: Vault = {
          id: newVaultId,
          name: handle.name,
          lastOpened: new Date(),
          tree,
          settings: DEFAULT_SETTINGS,
        }

        dispatch({ type: "ADD_VAULT", vault: newVault })

        // Update localStorage with the vault ids
        const updatedVaultIds = [...state.vaults.map((v) => v.id), newVaultId]
        localStorage.setItem(VAULT_IDS_KEY, JSON.stringify(updatedVaultIds))

        return newVault
      } catch (error) {
        console.error("Error adding vault:", error)
        return null
      }
    },
    [state.vaults, storeHandle],
  )

  // Refresh a vault's content
  const refreshVault = useCallback(
    async (vaultId: string) => {
      const vault = state.vaults.find((v) => v.id === vaultId)
      if (!vault) return

      try {
        let dirHandle: FileSystemDirectoryHandle | null = null

        // Try to get the handle from the tree directly or from IndexedDB
        if (vault.tree.handle) {
          dirHandle = vault.tree.handle as FileSystemDirectoryHandle
        } else if (vault.tree.handleId) {
          const handle = await getHandle(vault.tree.handleId)
          if (handle && handle.kind === "directory") {
            dirHandle = handle as FileSystemDirectoryHandle
          }
        }

        if (!dirHandle) {
          console.error("Could not find directory handle for vault:", vaultId)
          return
        }

        // Process the directory
        const tree = await processDirectory(dirHandle, vault.settings.general.ignorePatterns)

        // Update handle references
        const addHandleIds = (node: any) => {
          if (node.handle) {
            const nodeHandleId = createId()
            storeHandle(nodeHandleId, vaultId, node.id, node.handle).catch((err) =>
              console.error("Error storing node handle:", err),
            )
            node.handleId = nodeHandleId
          }
          node.children?.forEach(addHandleIds)
        }
        addHandleIds(tree)

        // Get tree root handleId
        const rootHandleId = vault.tree.handleId || createId()

        // Store the root handle if needed
        if (!vault.tree.handleId) {
          await storeHandle(rootHandleId, vaultId, "root", dirHandle)
        }

        // Convert to DB format
        const dbTree = treeToDbTree(tree)
        dbTree.handleId = rootHandleId

        // Update the database
        await db.update(vaults).set({ tree: dbTree }).where(eq(vaults.id, vaultId))

        // Update the state with the full tree including handles
        const updatedVault = { ...vault, tree }
        dispatch({ type: "UPDATE_VAULT", vault: updatedVault })
      } catch (error) {
        console.error("Error refreshing vault:", error)
      }
    },
    [state.vaults, getHandle, storeHandle],
  )

  // Update reference for a vault
  const updateReference = useCallback(
    async (
      vault: Vault,
      handle: FileSystemFileHandle,
      format: "biblatex" | "csl-json",
      path: string,
    ) => {
      try {
        // Check if this format already exists
        const existingRefs = await db.query.references.findMany({
          where: and(eq(references.vaultId, vault.id), eq(references.format, format)),
        })

        if (existingRefs.length > 0) return

        // Create a file record first
        const fileId = createId()
        await db.insert(files).values({
          id: fileId,
          name: path.split(".")[0], // Get name without extension
          extension: path.split(".").pop() || "",
          vaultId: vault.id,
          lastModified: new Date(),
          embeddingStatus: "in_progress",
        })

        // Store the handle in IndexedDB
        const handleId = createId()
        await storeHandle(handleId, vault.id, fileId, handle)

        // Add the reference to the database with the handle ID
        await db.insert(references).values({
          id: createId(),
          fileId,
          vaultId: vault.id,
          handleId,
          format,
          path,
          lastModified: new Date(),
        })
      } catch (error) {
        console.error("Error updating reference:", error)
        throw error
      }
    },
    [storeHandle],
  )

  // Load vaults from the database
  useEffect(() => {
    async function loadVaults() {
      dispatch({ type: "SET_LOADING", isLoading: true })

      try {
        const vaultIds = JSON.parse(localStorage.getItem(VAULT_IDS_KEY) || "[]")
        if (vaultIds.length === 0) {
          dispatch({ type: "SET_LOADING", isLoading: false })
          return
        }

        const vaultsList = await getAllVaults()

        const hydratedVaultsList = await Promise.all(
          vaultsList.map(async (dbVault: VaultDb) => {
            return await dbVaultToRuntimeVault(dbVault)
          }),
        )

        const validVaults = hydratedVaultsList.filter(Boolean) as Vault[]
        dispatch({ type: "SET_VAULTS", vaults: validVaults })

        // Set previously active vault if it exists
        const lastActiveId = localStorage.getItem("morph:active-vault")
        if (lastActiveId && validVaults.some((v) => v.id === lastActiveId)) {
          dispatch({ type: "SET_ACTIVE_VAULT_ID", id: lastActiveId })
        }
      } catch (error) {
        console.error("Error loading vaults:", error)
      } finally {
        dispatch({ type: "SET_LOADING", isLoading: false })
      }
    }

    if (state.vaults.length === 0) {
      loadVaults()
    }
  }, [getAllVaults, dbVaultToRuntimeVault, state.vaults.length])

  // Create a memoized value for the context
  const contextValue = useMemo(
    () => ({
      ...state,
      setActiveVaultId,
      getActiveVault,
      refreshVault,
      addVault,
      updateReference,
      dispatch,
    }),
    [
      state,
      setActiveVaultId,
      getActiveVault,
      refreshVault,
      addVault,
      updateReference,
    ],
  )

  return <VaultContext.Provider value={contextValue}>{children}</VaultContext.Provider>
}

export const useVaultContext = () => useContext(VaultContext)

export type { FlattenedFileMapping }
