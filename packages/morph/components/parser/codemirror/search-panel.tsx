"use client"

import { cn } from "@/lib"
import { SearchQuery, findNext, findPrevious, setSearchQuery } from "@codemirror/search"
import { EditorView } from "@codemirror/view"
import { CaretLeftIcon, CaretRightIcon, Cross2Icon } from "@radix-ui/react-icons"
import { useCallback, useEffect, useRef, useState } from "react"

import { VaultButton } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface SearchPanelProps {
  view: EditorView
  className?: string
  isVisible?: boolean
  onClose?: () => void
}

export function SearchPanel({ view, className, isVisible = true, onClose }: SearchPanelProps) {
  const [searchQuery, setSearchQueryState] = useState<string>("")
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false)
  const [totalMatches, setTotalMatches] = useState<number>(0)
  const [currentMatch, setCurrentMatch] = useState<number>(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the search input when the panel becomes visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 10)
    }
  }, [isVisible])

  // Update search in editor
  const updateSearch = useCallback(
    (query: string, caseSensitive: boolean) => {
      if (!view) return

      const searchOptions = {
        search: query,
        caseSensitive,
      }

      view.dispatch({
        effects: setSearchQuery.of(new SearchQuery(searchOptions)),
      })

      // Count matches
      if (query) {
        try {
          // Get all matches
          let count = 0
          const text = view.state.doc.toString()
          const searchRegex = new RegExp(
            caseSensitive ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            caseSensitive ? "g" : "gi",
          )

          const matches = text.match(searchRegex)
          if (matches) {
            count = matches.length
          }

          setTotalMatches(count)
          // Try to find current match index
          if (count > 0) {
            // If we can't determine the exact current match, just set to 1
            setCurrentMatch(1)
          } else {
            setCurrentMatch(0)
          }
        } catch (e) {
          // If regex fails, ignore
          setTotalMatches(0)
          setCurrentMatch(0)
        }
      } else {
        setTotalMatches(0)
        setCurrentMatch(0)
      }
    },
    [view],
  )

  // Handle search query changes
  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value
      setSearchQueryState(newQuery)
      updateSearch(newQuery, caseSensitive)
    },
    [caseSensitive, updateSearch],
  )

  // Handle case sensitivity toggle
  const handleCaseSensitiveToggle = useCallback(() => {
    const newValue = !caseSensitive
    setCaseSensitive(newValue)
    updateSearch(searchQuery, newValue)
  }, [caseSensitive, updateSearch, searchQuery])

  // Navigation functions
  const handleNext = useCallback(() => {
    if (!view) return
    findNext(view)
    if (totalMatches > 0) {
      setCurrentMatch((prev) => (prev === totalMatches ? 1 : prev + 1))
    }
  }, [view, totalMatches])

  const handlePrevious = useCallback(() => {
    if (!view) return
    findPrevious(view)
    if (totalMatches > 0) {
      setCurrentMatch((prev) => (prev === 1 ? totalMatches : prev - 1))
    }
  }, [view, totalMatches])

  const handleClose = useCallback(() => {
    if (onClose) onClose()
  }, [onClose])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (e.shiftKey) {
          handlePrevious()
        } else {
          handleNext()
        }
        e.preventDefault()
      } else if (e.key === "Escape") {
        handleClose()
        e.preventDefault()
      }
    },
    [handleNext, handlePrevious, handleClose],
  )

  if (!isVisible) return null

  return (
    <div
      className={cn(
        "cm-search-panel left-1/2 top-1/2 translate-x-1/2 z-20 bg-background border rounded-md shadow-md transform transition-all duration-300 ease-in-out",
        className,
      )}
    >
      <div className="p-2 pb-1.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              className="pl-8 h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm hover:cursor-pointer"
              type="text"
              value={searchQuery}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              autoFocus
            />
          </div>
          <VaultButton onClick={handleClose} size="small" className="p-1 h-6 w-6">
            <Cross2Icon className="h-3 w-3" />
          </VaultButton>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <label className="flex items-center space-x-1 text-xs text-foreground">
              <input
                type="checkbox"
                id="case-sensitive"
                checked={caseSensitive}
                onChange={handleCaseSensitiveToggle}
                className="h-3 w-3 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Match case</span>
            </label>

            {totalMatches > 0 && (
              <span className="text-xs text-muted-foreground">
                {currentMatch} of {totalMatches}
              </span>
            )}
          </div>

          <div className="flex gap-1">
            <VaultButton
              onClick={handlePrevious}
              size="small"
              className="text-xs w-6 h-6"
              title="Previous match (Shift+Enter or Mod-[)"
            >
              <CaretLeftIcon className="w-3 h-3" />
            </VaultButton>
            <VaultButton
              onClick={handleNext}
              size="small"
              className="text-xs w-6 h-6"
              title="Next match (Enter or Mod-])"
            >
              <CaretRightIcon className="w-3 h-3" />
            </VaultButton>
          </div>
        </div>
      </div>
    </div>
  )
}
