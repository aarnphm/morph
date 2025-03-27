"use client"

import { createContext, useEffect, useContext, useMemo, useCallback } from "react"
import FlexSearch from "flexsearch"
import { Document } from "flexsearch"
import type { FileSystemTreeNode, Vault } from "@/db"
import { db } from "@/db"
import { debounce } from "lodash"

export interface UserDocument {
  id: string
  title: string
  path: string
  // Add content field later
}

type SearchContextType = {
  index: Document | null
  getFileByName: (fileName: string) => Promise<string | undefined>
}

const SearchContext = createContext<SearchContextType>({
  index: null,
  getFileByName: async () => undefined,
})

export function SearchProvider({ children, vault }: { children: React.ReactNode; vault: Vault }) {
  const searchDb = new FlexSearch.IndexedDB("search")
  const index = useMemo(() => {
    return new FlexSearch.Index({ tokenize: "forward" })
  }, [])

  // Function to get a file by name
  const getFileByName = useCallback(
    async (fileName: string): Promise<string | undefined> => {
      if (!vault || !vault.id) return undefined
      return db.getFileIdByName(fileName, vault.id)
    },
    [vault],
  )

  // Memoize the indexNode function to ensure stable reference
  const indexNode = useCallback(
    async (node: FileSystemTreeNode) => {
      if (node.kind === "file" && node.extension === "md") {
        // Add document to search index
        await index.add({
          id: node.id,
          title: node.name,
          path: node.path,
        })

        // Add to fileName → fileId mapping
        if (vault && vault.id) {
          await db.indexFileName(node.name, node.id, vault.id)
        }
      }
      if (node.children) {
        for (const child of node.children) {
          await indexNode(child)
        }
      }
    },
    [index, vault],
  )

  // Debounce the indexing to prevent frequent re-executions
  const debouncedIndexNodes = useMemo(
    () =>
      debounce(async (nodes: FileSystemTreeNode[]) => {
        for (const node of nodes) {
          await indexNode(node)
        }
        // Commit changes to the index
        // await index.commit()
      }, 300),
    [indexNode, index],
  )

  // Initialize indexing when vault.tree changes
  useEffect(() => {
    if (vault && vault.tree && vault.tree.children) {
      debouncedIndexNodes(vault.tree.children)
    }
    // Cleanup debounced function on unmount or when dependencies change
    return () => {
      debouncedIndexNodes.cancel()
    }
  }, [vault, debouncedIndexNodes])

  // Memoize the context value to prevent unnecessary rerenders
  const value = useMemo(() => ({ index, getFileByName }), [index, getFileByName])

  return useMemo(
    () => <SearchContext.Provider value={value}>{children}</SearchContext.Provider>,
    [value, children],
  )
}

export const useSearch = () => useContext(SearchContext)
