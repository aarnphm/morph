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
  reconstructTreeWithHandles,
  treeToDbTree,
  vaultReducer,
} from "@/context/vault-reducer"
import type { FlattenedFileMapping, VaultAction, VaultState } from "@/context/vault-reducer"

import useFsHandles from "@/hooks/use-fs-handles"

import type { FileSystemTreeNode, Vault, VaultDb } from "@/db/interfaces"
import { DEFAULT_SETTINGS } from "@/db/interfaces"
import * as schema from "@/db/schema"

const VAULT_IDS_KEY = "morph:vault-ids"

type VaultContextType = VaultState & {
  setActiveVaultId: (id: string | null) => void
  getActiveVault: () => Vault | undefined
  addVault: (handle: FileSystemDirectoryHandle) => Promise<Vault | null>
}

const VaultContext = createContext<VaultContextType>({
  ...initialVaultState,
  setActiveVaultId: () => {},
  getActiveVault: () => undefined,
  addVault: async () => null,
})
const VaultDispatchContext = createContext<Dispatch<VaultAction> | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(vaultReducer, initialVaultState)
  const { storeHandle, getHandle } = useFsHandles()

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
    async (handle: FileSystemDirectoryHandle): Promise<Vault | null> => {
      try {
        const existing = state.vaults.find((v) => v.name === handle.name)
        if (existing) {
          const updatedVault = { ...existing, lastOpened: new Date() }

          await db
            .update(schema.vaults)
            .set({ lastOpened: updatedVault.lastOpened })
            .where(eq(schema.vaults.id, existing.id))

          dispatch({ type: "UPDATE_VAULT", vault: updatedVault })
          setActiveVaultId(existing.id)
          return updatedVault
        }

        const vaultId = createId()
        const runtimeTree = await processDirectory(vaultId, handle, DEFAULT_SETTINGS.ignorePatterns)

        const storeAllHandles = async (node: FileSystemTreeNode) => {
          if (node.handle) {
            try {
              await storeHandle(vaultId, node.id, node.handle)
            } catch (err) {
              console.error(`Error storing handle for ${node.path} (${node.id}):`, err)
            }
          }
          if (node.children) {
            await Promise.all(node.children.map(storeAllHandles))
          }
        }

        await storeAllHandles(runtimeTree)

        const dbTree = treeToDbTree(runtimeTree)

        const rootPath = `/vaults/${vaultId}`

        const newVaultDbData = {
          id: vaultId,
          name: handle.name,
          lastOpened: new Date(),
          tree: dbTree,
          settings: DEFAULT_SETTINGS,
          rootPath,
        }

        await db.insert(schema.vaults).values(newVaultDbData)

        const runtimeVault: Vault = {
          ...newVaultDbData,
          tree: runtimeTree,
        }

        dispatch({ type: "ADD_VAULT", vault: runtimeVault })
        setActiveVaultId(vaultId)

        const updatedVaultIds = [...state.vaults.map((v) => v.id), vaultId]
        localStorage.setItem(VAULT_IDS_KEY, JSON.stringify(updatedVaultIds))

        return runtimeVault
      } catch (error) {
        console.error("Error adding vault:", error)
        return null
      }
    },
    [state.vaults, storeHandle, db, setActiveVaultId],
  )

  // Load vaults from the database
  useEffect(() => {
    async function loadVaults() {
      if (state.vaults.length > 0 || state.isLoading === false) {
        return
      }
      dispatch({ type: "SET_LOADING", isLoading: true })

      try {
        const vaultIdsJson = localStorage.getItem(VAULT_IDS_KEY)
        if (!vaultIdsJson) {
          dispatch({ type: "SET_LOADING", isLoading: false })
          return
        }
        const vaultIds = JSON.parse(vaultIdsJson || "[]")
        if (!Array.isArray(vaultIds) || vaultIds.length === 0) {
          dispatch({ type: "SET_LOADING", isLoading: false })
          return
        }

        const vaultsListDb: VaultDb[] = await getAllVaults()

        const hydratedVaultsPromises = vaultsListDb.map(async (dbVault) => {
          try {
            const runtimeTree = await reconstructTreeWithHandles(
              dbVault.id,
              dbVault.tree,
              getHandle,
            )
            if (!runtimeTree) {
              console.error(`Failed to reconstruct tree for vault ${dbVault.id}`)
              return null
            }
            return {
              ...dbVault,
              tree: runtimeTree,
            } as Vault
          } catch (reconError) {
            console.error(`Error reconstructing vault ${dbVault.id}:`, reconError)
            return null
          }
        })

        const hydratedVaultsList = (await Promise.all(hydratedVaultsPromises)).filter(
          Boolean,
        ) as Vault[]

        dispatch({ type: "SET_VAULTS", vaults: hydratedVaultsList })

        const lastActiveId = localStorage.getItem("morph:active-vault")
        if (lastActiveId && hydratedVaultsList.some((v) => v.id === lastActiveId)) {
          dispatch({ type: "SET_ACTIVE_VAULT_ID", id: lastActiveId })
        } else if (hydratedVaultsList.length > 0) {
          const firstVaultId = hydratedVaultsList[0].id
          dispatch({ type: "SET_ACTIVE_VAULT_ID", id: firstVaultId })
          localStorage.setItem("morph:active-vault", firstVaultId)
        } else {
          dispatch({ type: "SET_ACTIVE_VAULT_ID", id: null })
          localStorage.removeItem("morph:active-vault")
        }
      } catch (error) {
        console.error("Error loading vaults:", error)
      } finally {
        dispatch({ type: "SET_LOADING", isLoading: false })
      }
    }

    loadVaults()
  }, [getAllVaults, getHandle, state.vaults.length, state.isLoading])

  // Create a memoized value for the context
  const vaultState = useMemo(
    () => ({
      ...state,
      setActiveVaultId,
      getActiveVault,
      addVault,
    }),
    [state, setActiveVaultId, getActiveVault, addVault],
  )

  return (
    <VaultContext.Provider value={vaultState}>
      <VaultDispatchContext.Provider value={dispatch}>{children}</VaultDispatchContext.Provider>
    </VaultContext.Provider>
  )
}

export const useVaultContext = () => {
  const context = useContext(VaultContext)
  if (context === undefined) {
    throw new Error("useVaultContext must be used within a VaultProvider")
  }
  return context
}

export const useVaultDispatch = () => {
  const dispatch = useContext(VaultDispatchContext)
  if (dispatch === null) {
    throw new Error("useVaultDispatch must be used within a VaultProvider")
  }
  return dispatch
}

export type { FlattenedFileMapping }
