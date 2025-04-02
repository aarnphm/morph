"use client"

import { encode } from "@/lib"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { Document } from "flexsearch"
import { debounce } from "lodash"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { usePGlite } from "@/context/db"

import type { FileSystemTreeNode, Vault } from "@/db/interfaces"
import * as schema from "@/db/schema"

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
  getFileIdByName: (fileName: string) => Promise<string | undefined>
  isIndexReady: boolean
  searchDocuments: (query: string, options?: any) => Promise<Array<SearchResultItem>>
}

const SearchContext = createContext<SearchContextType>({
  index: null,
  getFileIdByName: async () => undefined,
  isIndexReady: false,
  searchDocuments: async () => [],
})

export function SearchProvider({ children, vault }: { children: React.ReactNode; vault: Vault }) {
  const [isIndexReady, setIsIndexReady] = useState(false)
  const client = usePGlite()
  const db = drizzle({ client, schema })

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

  const getFileIdByName = useCallback(
    async (fileName: string): Promise<string | undefined> => {
      if (!vault || !vault.id) return undefined
      try {
        const result = await db.query.files.findFirst({
          where: and(eq(schema.files.vaultId, vault.id), eq(schema.files.name, fileName)),
        })
        return result?.id
      } catch (error) {
        console.error("Error fetching file ID by name:", error)
        return undefined
      }
    },
    [vault, db],
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
      if (!index || !isIndexReady) return

      if (node.kind === "file" && node.extension === "md") {
        await index.add({
          id: node.id,
          title: node.name,
          path: node.path,
        })

        // Removed db.indexFileName - FlexSearch handles in-memory indexing
      }
      if (node.children) {
        for (const child of node.children) {
          await indexNode(child)
        }
      }
    },
    [index, isIndexReady],
  )

  // Debounce the indexing to prevent frequent re-executions
  const debouncedIndexNodes = useMemo(
    () =>
      debounce(async (nodes: FileSystemTreeNode[]) => {
        if (!isIndexReady || !index) return

        // Clear existing index before re-indexing
        // This might need adjustment based on desired behavior (incremental vs full re-index)
        // For simplicity, we clear and re-add here.
        // Consider using index.remove or index.update for more granular control if needed.
        // Note: FlexSearch Document doesn't have a clear() method. Re-instantiating might be needed for full clear.
        // For now, we will just add, assuming duplicates won't cause major issues or are handled.

        console.log("Indexing vault content...")
        for (const node of nodes) {
          await indexNode(node)
        }
        console.log("Indexing complete.")
      }, 500), // Increased debounce time slightly
    [indexNode, isIndexReady, index],
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
      getFileIdByName,
      isIndexReady,
      searchDocuments,
    }),
    [index, getFileIdByName, isIndexReady, searchDocuments],
  )

  return useMemo(
    () => <SearchContext.Provider value={value}>{children}</SearchContext.Provider>,
    [value, children],
  )
}

export const useSearch = () => useContext(SearchContext)
