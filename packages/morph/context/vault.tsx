"use client"

import { createId } from "@paralleldrive/cuid2"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import {
  Dispatch,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react"

import { usePGlite } from "@/context/db"
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
import * as schema from "@/db/schema"

const VAULT_IDS_KEY = "morph:vault-ids"

type VaultContextType = VaultState & {
  setActiveVaultId: (id: string | null) => void
  getActiveVault: () => Vault | undefined
  refreshVault: (vaultId: string) => Promise<void>
  addVault: (handle: FileSystemDirectoryHandle) => Promise<Vault | null>
}

const VaultContext = createContext<VaultContextType>({
  ...initialVaultState,
  setActiveVaultId: () => {},
  getActiveVault: () => undefined,
  refreshVault: async () => {},
  addVault: async () => null,
})
const VaultDispatchContext = createContext<Dispatch<VaultAction> | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(vaultReducer, initialVaultState)
  const { storeHandle, getHandle } = useFsHandles()
  const { dbVaultToRuntimeVault } = useDatabaseModels()

  const client = usePGlite()
  const db = useMemo(() => drizzle({ client, schema }), [client])

  // Get all vaults from the database
  const getAllVaults = useCallback(async () => {
    try {
      return await db.query.vaults.findMany()
    } catch (error) {
      console.error("Error fetching all vaults:", error)
      return []
    }
  }, [db])

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

          await db
            .update(schema.vaults)
            .set({ lastOpened: new Date() })
            .where(eq(schema.vaults.id, existing.id))

          dispatch({ type: "UPDATE_VAULT", vault: updatedVault })
          return updatedVault
        }

        // Process directory to build the tree
        const tree = await processDirectory(handle, DEFAULT_SETTINGS.ignorePatterns)

        // Store the directory handle in IndexedDB for the *generic handles* table
        const treeHandleId = createId()
        // Use storeHandle from the hook for the generic handles table
        await storeHandle(treeHandleId, treeHandleId, "root", handle) // Pass "root" as id prefix

        const addHandleIds = (node: FileSystemTreeNode) => {
          if (node.handle) {
            const nodeHandleId = createId()
            // Store individual file/dir handles in the generic handles table
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

        // Generate a unique ID hash for this vault to avoid namespace collisions
        const uniqueHash = createId().slice(0, 6)
        const rootPath = `${handle.name}-${uniqueHash}`

        // Insert the new vault into database
        const newVaultId = createId()

        await db.insert(schema.vaults).values({
          id: newVaultId,
          name: handle.name,
          lastOpened: new Date(),
          tree: dbTree,
          settings: DEFAULT_SETTINGS,
          rootPath,
        })

        // The vault for state needs the actual handle
        const newVault: Vault = {
          id: newVaultId,
          name: handle.name,
          lastOpened: new Date(),
          tree,
          settings: DEFAULT_SETTINGS,
          rootPath,
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
    [state.vaults, storeHandle, db],
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
        const tree = await processDirectory(dirHandle, vault.settings.ignorePatterns)

        // Update handle references
        const addHandleIds = (node: FileSystemTreeNode) => {
          if (node.handle) {
            const nodeHandleId = createId()
            // Use storeHandle from the hook for the generic handles table
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

        // Keep existing rootPath - no need to regenerate as it should be unique
        const rootPath = vault.rootPath

        // Convert to DB format
        const dbTree = treeToDbTree(tree)
        dbTree.handleId = rootHandleId

        // Update the database
        await db.update(schema.vaults)
          .set({
            tree: dbTree,
            rootPath
          })
          .where(eq(schema.vaults.id, vaultId))

        // Update the state with the full tree including handles
        const updatedVault = { ...vault, tree, rootPath }
        dispatch({ type: "UPDATE_VAULT", vault: updatedVault })
      } catch (error) {
        console.error("Error refreshing vault:", error)
      }
    },
    [state.vaults, getHandle, storeHandle, db],
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
  const vaultState = useMemo(
    () => ({
      ...state,
      setActiveVaultId,
      getActiveVault,
      refreshVault,
      addVault,
      dispatch,
    }),
    [state, setActiveVaultId, getActiveVault, refreshVault, addVault],
  )

  return (
    <VaultContext.Provider value={vaultState}>
      <VaultDispatchContext.Provider value={dispatch}>{children}</VaultDispatchContext.Provider>
    </VaultContext.Provider>
  )
}

export const useVaultContext = () => useContext(VaultContext)

export type { FlattenedFileMapping }
