import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { type UserDocument, useSearch } from "@/context/search-context"
import { useEffect, useState, useCallback, useMemo } from "react"
import type { Vault, FileSystemTreeNode } from "@/db"
import { type FlattenedFileMapping } from "@/context/vault-context"
import { CommandGroup } from "cmdk"
import { highlight, slugifyFilePath, toJsx } from "@/lib"
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic"
import { useToast } from "@/hooks/use-toast"

type SearchCommandProps = {
  maps: FlattenedFileMapping
  vault: Vault
  onFileSelect: (node: FileSystemTreeNode) => void
}

export function SearchCommand({ maps, vault, onFileSelect }: SearchCommandProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [results, setResults] = useState<Array<UserDocument>>([])
  const [searchKey, setSearchKey] = useState(0)
  const { isIndexReady, searchDocuments } = useSearch()
  const { toast } = useToast()

  // Debounce the query input to reduce the number of search operations
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 20)
    return () => clearTimeout(handler)
  }, [query])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      } else if (e.key === "Escape" && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open])

  // Search functionality
  useEffect(() => {
    if (!open || !isIndexReady || !debouncedQuery.trim()) {
      setResults([])
      return
    }

    let isMounted = true

    const performSearch = async () => {
      try {
        // Use the search method from the context to avoid TypeScript errors
        const searchResults = await searchDocuments(debouncedQuery, {
          index: ["title"],
          limit: 100,
          suggest: true,
        })

        if (!isMounted) return

        // Handle empty results
        if (!searchResults || searchResults.length === 0) {
          setResults([])
          return
        }

        // Process the search results
        const uniqueIds = new Set<string>()

        // Collect unique document IDs from search results
        for (const result of searchResults) {
          if (result && Array.isArray(result.result)) {
            for (const id of result.result) {
              uniqueIds.add(String(id))
            }
          }
        }

        // Map IDs to document objects
        const docs = Array.from(uniqueIds)
          .map((id) => {
            const item = maps.get(id)
            if (!item) return null

            return {
              id,
              title: item.name,
              path: item.path,
            }
          })
          .filter(Boolean) as UserDocument[]

        if (isMounted) {
          setResults(docs)
        }
      } catch (error) {
        if (isMounted) {
          console.error("Search error:", error)
          toast({ title: "Cmd-K", description: "Failed to search query" })
          setResults([])
        }
      }
    }

    performSearch()

    return () => {
      isMounted = false
    }
  }, [debouncedQuery, open, searchDocuments, maps, toast, isIndexReady])

  // Update the search key when the dialog opens
  useEffect(() => {
    if (open) {
      setSearchKey((prev) => prev + 1)
    }
  }, [open])

  const handleSelect = useCallback(
    (id: string) => {
      if (!vault?.tree) return

      const findNode = (nodes?: FileSystemTreeNode[]): FileSystemTreeNode | undefined => {
        if (!nodes) return
        for (const node of nodes) {
          if (node.id === id) return node
          if (node.children) {
            const found = findNode(node.children)
            if (found) return found
          }
        }
      }

      const node = findNode(vault.tree.children)
      if (node) {
        onFileSelect(node)
      }
    },
    [vault, onFileSelect],
  )

  // Memoize the item selection handler to prevent unnecessary re-renders
  const handleItemSelect = useCallback(
    (id: string) => {
      handleSelect(id)
      setQuery("")
      setDebouncedQuery("")
      setOpen(false)
    },
    [handleSelect],
  )

  const MemoizedCommandItems = useMemo(() => {
    return (
      <CommandGroup className="flex flex-col gap-1 mt-1">
        {results.map((file) => {
          const links = slugifyFilePath(file.path)
          return (
            <CommandItem
              key={file.id}
              value={file.path}
              onSelect={() => handleItemSelect(file.id)}
              className="flex whitespace-pre-wrap gap-0 px-3 py-1.5 text-sm/7 flex-col items-start"
            >
              <span className="italic">
                {query
                  ? toJsx(
                      fromHtmlIsomorphic(highlight(query, file.path.substring(1)), {
                        fragment: true,
                      }),
                    )
                  : links}
              </span>
            </CommandItem>
          )
        })}
      </CommandGroup>
    )
  }, [results, handleItemSelect, query])

  // Memoize CommandInput to prevent unnecessary re-renders
  const MemoizedCommandInput = useMemo(
    () => (
      <CommandInput placeholder="Rechercher quelque chose" value={query} onValueChange={setQuery} />
    ),
    [query, setQuery],
  )

  // Memoize CommandDialog to prevent unnecessary re-renders
  return useMemo(
    () => (
      <CommandDialog
        key={searchKey}
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(!isOpen)
          setQuery("")
          setDebouncedQuery("")
        }}
        title="Rechercher quelque chose"
        description="Rechercher un fichier dans le répertoire"
        className="backdrop-blur-dialog"
      >
        {MemoizedCommandInput}
        <CommandList
          className="min-h-[20rem] relative overflow-y-auto"
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === "p") {
              e.preventDefault()
              const items = document.querySelectorAll("[cmdk-item]")
              const activeElement = document.activeElement
              const currentIndex = Array.from(items).findIndex((item) => item === activeElement)
              if (currentIndex > 0) {
                const prevItem = items[currentIndex - 1] as HTMLElement
                prevItem.focus()
              }
            }
            if (e.ctrlKey && e.key === "n") {
              e.preventDefault()
              const items = document.querySelectorAll("[cmdk-item]")
              const activeElement = document.activeElement
              const currentIndex = Array.from(items).findIndex((item) => item === activeElement)
              if (currentIndex < items.length - 1) {
                const nextItem = items[currentIndex + 1] as HTMLElement
                nextItem.focus()
              }
            }
          }}
        >
          <CommandEmpty className="flex whitespace-pre-wrap gap-0 px-3 py-1.5 text-xs/8 flex-col py-2 items-start text-muted-foreground italic">
            {!isIndexReady ? "Initialisation de la recherche..." : "Aucun fichier trouvé"}
          </CommandEmpty>
          {MemoizedCommandItems}
        </CommandList>
        <ul id="helper">
          <li>
            <kbd>↑↓</kbd> pour naviguer
          </li>
          <li>
            <kbd>⌘ k</kbd> pour active
          </li>
          <li>
            <kbd>↵</kbd> pour ouvrir
          </li>
          <li>
            <kbd>esc</kbd> pour rejeter
          </li>
        </ul>
      </CommandDialog>
    ),
    [open, setOpen, MemoizedCommandInput, MemoizedCommandItems, searchKey, isIndexReady],
  )
}
