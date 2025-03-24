"use client"

import { createContext, useEffect, useContext, useMemo, useCallback } from "react"
import FlexSearch from "flexsearch"
import type { FileSystemTreeNode, Vault } from "@/db"
import { encode } from "@/lib"
import { debounce } from "lodash"

export interface UserDocument {
  id: string
  title: string
  path: string
  // Add content field later
}

type SearchContextType = {
  index: FlexSearch.Document<UserDocument> | null
}

const SearchContext = createContext<SearchContextType>({ index: null })

export function SearchProvider({ children, vault }: { children: React.ReactNode; vault: Vault }) {
  // Memoize the FlexSearch index
  const index = useMemo(() => {
    return new FlexSearch.Document<UserDocument>({
      charset: "latin:extra",
      encode: encode,
      document: {
        id: "id",
        index: [
          {
            field: "title",
            tokenize: "forward",
            optimize: true,
          },
          {
            field: "path",
            tokenize: "forward",
          },
        ],
      },
    })
  }, []) // No dependencies since the index configuration is static

  // Memoize the indexNode function to ensure stable reference
  const indexNode = useCallback(
    async (node: FileSystemTreeNode) => {
      const promises: Promise<FlexSearch.Document<UserDocument>>[] = []
      if (node.kind === "file" && node.extension === "md") {
        promises.push(
          index.addAsync(node.id, {
            id: node.id,
            title: node.name,
            path: node.path,
          }),
        )
      }
      if (node.children) {
        for (const child of node.children) {
          indexNode(child)
        }
      }
      await Promise.all(promises)
    },
    [index],
  )

  // Debounce the indexing to prevent frequent re-executions
  const debouncedIndexNodes = useMemo(
    () =>
      debounce(async (nodes: FileSystemTreeNode[]) => {
        const promises = nodes.map((node) => indexNode(node))
        await Promise.all(promises)
      }, 300),
    [indexNode],
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
  const value = useMemo(() => ({ index }), [index])

  return useMemo(
    () => <SearchContext.Provider value={value}>{children}</SearchContext.Provider>,
    [value, children],
  )
}

export const useSearch = () => useContext(SearchContext)
