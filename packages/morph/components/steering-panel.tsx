"use client"

import { cn } from "@/lib"
import {
  submitContentForAuthors,
  useProcessPendingAuthor,
  useRecommendedAuthors,
} from "@/services/authors"
import { CheckIcon, Cross2Icon, MagicWandIcon, PlusIcon } from "@radix-ui/react-icons"
import { drizzle } from "drizzle-orm/pglite"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { md } from "@/components/parser"
import { Input } from "@/components/ui/input"

import { useAuthorTasks } from "@/context/authors"
import { usePGlite } from "@/context/db"
import { useNotesContext } from "@/context/notes"

import * as schema from "@/db/schema"

interface AuthorsSelectorProps {
  value: string[]
  onChange: (authors: string[]) => void
  className?: string
  markdownContent: string
}

export function AuthorsSelector({
  value,
  onChange,
  className,
  markdownContent,
}: AuthorsSelectorProps) {
  const [authors, setAuthors] = useState<string[]>(value)
  const [newAuthor, setNewAuthor] = useState<string>("")
  const [isAdding, setIsAdding] = useState(false)
  const [isInferring, setIsInferring] = useState(false)
  const [isPending, setIsPending] = useState(false)

  // Get current content and fileId from notes context
  const {
    state: { currentFileId },
  } = useNotesContext()
  const { addTask, pendingTaskIds } = useAuthorTasks()

  // Get DB client
  const client = usePGlite()
  const db = drizzle({ client, schema })

  // Load recommended authors from the database
  const { data: recommendedAuthors } = useRecommendedAuthors(currentFileId)

  // Process pending authors function
  const processPendingAuthor = useProcessPendingAuthor(db)

  // Check if we should stop inferring when pending tasks change
  useEffect(() => {
    if (isInferring && pendingTaskIds.length === 0) {
      setIsInferring(false)
    }
  }, [pendingTaskIds, isInferring])

  // Update local state when context changes
  useEffect(() => {
    // Only update if the arrays are actually different to avoid loops
    if (JSON.stringify(authors) !== JSON.stringify(value)) {
      setAuthors([...value]) // Create a new array
    }
  }, [value, authors])

  // When recommended authors are loaded, update the authors list if it's empty
  useEffect(() => {
    if (
      recommendedAuthors?.authors &&
      recommendedAuthors.authors.length > 0 &&
      authors.length === 0
    ) {
      // Only update if we don't already have authors
      const newAuthors = [...recommendedAuthors.authors]
      setAuthors(newAuthors)
      onChange(newAuthors)
    }
  }, [recommendedAuthors, authors.length, onChange])

  // When isInferring changes to false after being true, get the latest recommended authors
  const wasInferring = useRef(false)

  useEffect(() => {
    if (wasInferring.current && !isInferring) {
      // Refresh recommended authors after inference completes
      if (recommendedAuthors?.authors && recommendedAuthors.authors.length > 0) {
        const newAuthors = [...recommendedAuthors.authors]
        setAuthors(newAuthors)
        onChange(newAuthors)
        toast.success("Updated authors based on document content")
      }
    }
    wasInferring.current = isInferring
  }, [isInferring, recommendedAuthors, onChange])

  // Inference handler
  const handleInferAuthors = useCallback(async () => {
    // We need both the current file ID and document content
    if (!currentFileId) {
      toast.error("Please save the file first before inferring authors")
      return
    }

    try {
      setIsInferring(true)
      toast.info("Analyzing document to infer authors...")

      // Clean the content using the md parser
      const cleanedContent = md(markdownContent).content
      // Submit the content for author inference
      const taskId = await submitContentForAuthors(db, currentFileId, cleanedContent)

      if (taskId) {
        // Add the task to the queue
        addTask(taskId, currentFileId)
        toast.success("Authors are being inferred. This may take a moment.")
      } else {
        toast.info("Authors have already been inferred for this document")
        setIsInferring(false)
      }
    } catch (error) {
      console.error("Error inferring authors:", error)
      toast.error("Failed to infer authors from content")
      setIsInferring(false)
    }
  }, [currentFileId, db, addTask])

  const handleAddAuthor = useCallback(() => {
    if (!newAuthor.trim()) return

    // Create a new Set from current authors to ensure uniqueness
    const authorsSet = new Set(authors)

    // If the author already exists, don't add it
    if (authorsSet.has(newAuthor.trim())) {
      setNewAuthor("")
      setIsAdding(false)
      return
    }

    // Add to set and convert back to array
    authorsSet.add(newAuthor.trim())
    const updatedAuthors = Array.from(authorsSet)

    // Update both local and context state
    setAuthors(updatedAuthors)
    onChange([...updatedAuthors]) // Create a new array to ensure reference changes
    setNewAuthor("")
    setIsAdding(false)
  }, [authors, onChange, newAuthor])

  const handleRemoveAuthor = useCallback(
    (index: number) => {
      // Create a new array without modifying the original
      const updatedAuthors = authors.filter((_, i) => i !== index)

      // Update both local and context state
      setAuthors(updatedAuthors)
      onChange([...updatedAuthors]) // Create a new array to ensure reference changes
    },
    [authors, onChange],
  )

  // Handle saving pending authors
  const handleSavePendingAuthors = useCallback(async () => {
    if (!currentFileId || authors.length === 0) {
      return
    }

    setIsPending(true)
    try {
      await processPendingAuthor(currentFileId, { authors })
      toast.success("Saved pending authors")
    } catch (error) {
      console.error("Error saving pending authors:", error)
      toast.error("Failed to save pending authors")
    } finally {
      setIsPending(false)
    }
  }, [currentFileId, authors, processPendingAuthor])

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleAddAuthor()
      }
    },
    [handleAddAuthor],
  )

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Authors</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 hover:cursor-pointer"
            onClick={handleInferAuthors}
            disabled={isInferring || isPending}
            title="Auto-infer authors from document"
          >
            <MagicWandIcon className={cn("h-3 w-3", isInferring && "animate-pulse")} />
            {isInferring && <span className="text-xs">Inferring...</span>}
          </button>
          <button
            type="button"
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 hover:cursor-pointer",
              (isInferring || isPending) && "opacity-50 cursor-not-allowed",
            )}
            onClick={handleSavePendingAuthors}
            disabled={isInferring || isPending}
            title="Save as pending authors"
          >
            <CheckIcon className={cn("h-3 w-3", isPending && "animate-pulse")} />
            {isPending && <span className="text-xs">Saving...</span>}
          </button>
          <button
            type="button"
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground  hover:cursor-pointer",
              (isInferring || isPending) && "opacity-50 cursor-not-allowed",
            )}
            onClick={() => setIsAdding(true)}
            disabled={isInferring || isPending}
          >
            <PlusIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {isAdding && !isInferring && !isPending && (
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            type="text"
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Add author"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAddAuthor}
            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
          >
            Add
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {authors.map((author, index) => (
          <div
            key={index}
            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs cursor-pointer"
          >
            <span>{author}</span>
            <button
              type="button"
              onClick={() => handleRemoveAuthor(index)}
              className={cn("hover:text-primary", isInferring && "opacity-50 cursor-not-allowed")}
              disabled={isInferring}
            >
              <Cross2Icon className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

interface TonalityRadarProps {
  value: Record<string, number>
  onChange: (tonality: Record<string, number>) => void
  enabled: boolean
  onToggle: (enabled: boolean) => void
  className?: string
}

export function TonalityRadar({
  value,
  onChange,
  enabled,
  onToggle,
  className,
}: TonalityRadarProps) {
  const isInternalChange = useRef(false)
  const [tonality, setTonality] = useState<Record<string, number>>(value)
  const previousTonalityRef = useRef<Record<string, number>>(value)

  // Compare two tonality objects for equality
  const isTonalityEqual = useCallback((a: Record<string, number>, b: Record<string, number>) => {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    if (keysA.length !== keysB.length) return false

    return keysA.every((key) => {
      // Use a small epsilon for floating point comparison
      const epsilon = 0.00001
      return Math.abs(a[key] - b[key]) < epsilon
    })
  }, [])

  useEffect(() => {
    if (!isInternalChange.current && enabled) {
      // Only update local state if the values are actually different
      if (!isTonalityEqual(tonality, value)) {
        setTonality(value)
        previousTonalityRef.current = value
      }
    }
    isInternalChange.current = false
  }, [enabled, value, tonality, isTonalityEqual])

  useEffect(() => {
    if (enabled && !isInternalChange.current) {
      // Only call onChange if tonality has actually changed from previous value
      if (!isTonalityEqual(tonality, previousTonalityRef.current)) {
        previousTonalityRef.current = tonality
        onChange(tonality)
      }
    }
  }, [enabled, onChange, tonality, isTonalityEqual])

  const handleTonalityChange = (key: string, value: number) => {
    isInternalChange.current = true

    const newTonality = { ...tonality, [key]: value }

    const restSum = Object.entries(newTonality)
      .filter(([k]) => k !== key)
      .reduce((sum, [, v]) => sum + v, 0)

    if (restSum + value > 1) {
      const scale = restSum > 0 ? (1 - value) / restSum : 0

      Object.keys(newTonality).forEach((k) => {
        if (k !== key) {
          newTonality[k] = scale * newTonality[k]
        }
      })
    }

    setTonality(newTonality)
    previousTonalityRef.current = newTonality

    if (enabled) {
      onChange(newTonality)
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Tonality</label>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="tonality-toggle"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="tonality-toggle" className="ml-2 text-xs text-foreground">
            Enable
          </label>
        </div>
      </div>

      {enabled && (
        <div className="space-y-3">
          {Object.keys(tonality).map((key) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs capitalize">{key}</label>
                <span className="text-xs text-foreground">{Math.round(tonality[key] * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={tonality[key]}
                onChange={(e) => handleTonalityChange(key, parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface TemperatureSliderProps {
  value: number
  onChange: (temperature: number) => void
  className?: string
}

export function TemperatureSlider({ value, onChange, className }: TemperatureSliderProps) {
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value))
    },
    [onChange],
  )

  const getLabel = (temp: number) => {
    if (temp <= 0.3) return "Deterministic"
    if (temp <= 0.6) return "Balanced"
    if (temp <= 0.8) return "Creative"
    return "Unhinged"
  }

  const getColor = (temp: number) => {
    if (temp <= 0.3) return "text-blue-500"
    if (temp <= 0.6) return "text-green-500"
    if (temp <= 0.8) return "text-yellow-500"
    return "text-red-500"
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Vibes</label>
        <span className={cn("text-xs font-medium", getColor(value))}>
          {getLabel(value)} ({value.toFixed(2)})
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={handleSliderChange}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
      />
      <div className="flex justify-between text-xs text-foreground">
        <span>Deterministic</span>
        <span>Unhinged</span>
      </div>
    </div>
  )
}

interface SuggestionsSliderProps {
  value: number
  onChange: (numSuggestions: number) => void
  className?: string
}

export function SuggestionsSlider({ value, onChange, className }: SuggestionsSliderProps) {
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseInt(e.target.value))
    },
    [onChange],
  )

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Notes</label>
        <span className="text-xs text-foreground">{value}</span>
      </div>
      <input
        type="range"
        min="1"
        max="8"
        step="1"
        value={value}
        onChange={handleSliderChange}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
      />
      <div className="flex justify-between text-xs text-foreground">
        <span>1</span>
        <span>8</span>
      </div>
    </div>
  )
}
