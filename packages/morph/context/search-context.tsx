"use client"

import { createContext, useEffect, useContext, useMemo, useCallback, useState } from "react"
import { Document } from "flexsearch"
import type { FileSystemTreeNode, Vault } from "@/db"
import { db } from "@/db"
import { encode } from "@/lib"
import { debounce } from "lodash"

export interface UserDocument {
  id: string
  title: string
  path: string
}

// Define types for FlexSearch 0.8 results
export type SearchResultItem = {
  field?: string
  result: Array<string | number>
}

type SearchContextType = {
  index: Document | null
  getFileByName: (fileName: string) => Promise<string | undefined>
  isIndexReady: boolean
  searchDocuments: (query: string, options?: any) => Promise<Array<SearchResultItem>>
}

const SearchContext = createContext<SearchContextType>({
  index: null,
  getFileByName: async () => undefined,
  isIndexReady: false,
  searchDocuments: async () => [],
})

export function SearchProvider({ children, vault }: { children: React.ReactNode; vault: Vault }) {
  const [isIndexReady, setIsIndexReady] = useState(false)

  // Memoize the FlexSearch index
  const index = useMemo(() => {
    // Create a document index with proper configuration for FlexSearch 0.8
    return new Document({
      tokenize: "forward",
      encode: encode,
      document: {
        id: "id",
        index: ["title", "path"],
      },
    })
  }, [])

  // Set up persistence when component mounts
  useEffect(() => {
    if (!index || typeof window === "undefined") return

    const initializeIndex = async () => {
      try {
        // Initialize without explicit persistence for now
        setIsIndexReady(true)
      } catch (error) {
        console.error("Failed to initialize search index:", error)
        setIsIndexReady(false)
      }
    }

    initializeIndex()
  }, [index])

  const getFileByName = useCallback(
    async (fileName: string): Promise<string | undefined> => {
      if (!vault || !vault.id) return undefined
      return db.getFileIdByName(fileName, vault.id)
    },
    [vault],
  )

  // Create a wrapper search function to avoid TypeScript errors
  const searchDocuments = useCallback(
    async (query: string, options?: any): Promise<Array<SearchResultItem>> => {
      if (!index || !isIndexReady || !query.trim()) {
        return []
      }

      try {
        const searchOptions = {
          index: ["title"],
          limit: 100,
          suggest: true,
          ...options,
        }

        // Use a type assertion to avoid the TypeScript self-referential Promise error
        return await Promise.resolve().then(() => {
          // This avoids the TypeScript error by breaking the direct Promise chain
          return index.search(query, searchOptions) as unknown as Array<SearchResultItem>
        })
      } catch (error) {
        console.error("Search error:", error)
        return []
      }
    },
    [index, isIndexReady],
  )

  const indexNode = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!isIndexReady) return

      if (node.kind === "file" && node.extension === "md") {
        await index.add({
          id: node.id,
          title: node.name,
          path: node.path,
        })

        // Add to fileName → fileId mapping in our Dexie database
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
    [index, vault, isIndexReady],
  )

  // Debounce the indexing to prevent frequent re-executions
  const debouncedIndexNodes = useMemo(
    () =>
      debounce(async (nodes: FileSystemTreeNode[]) => {
        if (!isIndexReady) return

        for (const node of nodes) {
          await indexNode(node)
        }
      }, 300),
    [indexNode, isIndexReady],
  )

  // Initialize indexing when vault.tree changes
  useEffect(() => {
    if (vault && vault.tree && vault.tree.children && isIndexReady) {
      debouncedIndexNodes(vault.tree.children)
    }
    // Cleanup debounced function on unmount or when dependencies change
    return () => {
      debouncedIndexNodes.cancel()
    }
  }, [vault, debouncedIndexNodes, isIndexReady])

  // Memoize the context value to prevent unnecessary rerenders
  const value = useMemo(
    () => ({
      index,
      getFileByName,
      isIndexReady,
      searchDocuments,
    }),
    [index, getFileByName, isIndexReady, searchDocuments],
  )

  return useMemo(
    () => <SearchContext.Provider value={value}>{children}</SearchContext.Provider>,
    [value, children],
  )
}

export const useSearch = () => useContext(SearchContext)
