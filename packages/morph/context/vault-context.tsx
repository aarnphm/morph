"use client"

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import useVaults from "@/hooks/use-vaults"
import type { Vault, FileSystemTreeNode } from "@/db"

type VaultContextType = {
  activeVaultId: string | null
  vaults: Vault[]
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
  isLoading: boolean
  flattenedFileIds: FlattenedFileMapping
}

const VaultContext = createContext<VaultContextType>({
  activeVaultId: null,
  vaults: [],
  setActiveVaultId: () => {},
  getActiveVault: () => undefined,
  refreshVault: async () => {},
  addVault: async () => null,
  updateReference: async () => {},
  isLoading: true,
  flattenedFileIds: new Map(),
})

export type FlattenedFileMapping = Map<string, { name: string; path: string }>

// TODO: refactor using Reducer and Context
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null)
  const { vaults, refreshVault, addVault, updateReference, setVaults, getAllVaults } = useVaults()
  const [isLoading, setIsLoading] = useState(true)

  const getActiveVault = useCallback(() => {
    return activeVaultId ? vaults.find((v) => v.id === activeVaultId) : undefined
  }, [activeVaultId, vaults])

  const flattenedFileIds = useMemo(() => {
    const map: FlattenedFileMapping = new Map()

    const processNode = (node: FileSystemTreeNode) => {
      if (node.kind === "file") map.set(node.id, { name: node.name, path: node.path })
      node.children?.forEach(processNode)
    }

    for (const vault of vaults) {
      if (vault.tree) vault.tree.children?.forEach(processNode)
    }

    return map
  }, [vaults])

  // Handle initial vault hydration and persist active vault changes
  useEffect(() => {
    if (vaults.length === 0) {
      getAllVaults()
        .then((vaults) => {
          setVaults(vaults)
          const lastActiveId = localStorage.getItem("morph:active-vault")
          if (lastActiveId && vaults.some((v) => v.id === lastActiveId)) {
            setActiveVaultId(lastActiveId)
            localStorage.setItem("morph:active-vault", lastActiveId)
          }
          setIsLoading(false)
          return
        })
        .catch(() => {
          const timer = setTimeout(() => setIsLoading(false), 1000)
          return () => clearTimeout(timer)
        })
    }
  }, [vaults, getAllVaults, setVaults, setActiveVaultId])

  return (
    <VaultContext.Provider
      value={{
        vaults,
        activeVaultId,
        updateReference,
        setActiveVaultId,
        getActiveVault,
        refreshVault,
        addVault,
        isLoading,
        flattenedFileIds,
      }}
    >
      {children}
    </VaultContext.Provider>
  )
}

export const useVaultContext = () => useContext(VaultContext)
