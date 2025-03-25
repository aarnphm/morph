"use client"

import * as React from "react"
import { useEffect, useCallback, useState, useRef, useMemo, memo } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { EditorView } from "@codemirror/view"
import { Compartment, EditorState } from "@codemirror/state"
import {
  Pencil1Icon,
  EyeOpenIcon,
  ShadowInnerIcon,
  StackIcon,
  Cross2Icon,
} from "@radix-ui/react-icons"
import usePersistedSettings from "@/hooks/use-persisted-settings"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Vim, vim } from "@replit/codemirror-vim"
import { NoteCard } from "@/components/note-card"
import Explorer from "@/components/explorer"
import { Toolbar } from "@/components/toolbar"
import { fileField, mdToHtml } from "@/components/markdown-inline"
import { toJsx, cn } from "@/lib"
import type { Root } from "hast"
import { useTheme } from "next-themes"
import { useVaultContext } from "@/context/vault-context"
import { md, frontmatter, syntaxHighlighting, theme as editorTheme } from "@/components/parser"
import { setFile } from "@/components/markdown-inline"
import { DotIcon } from "@/components/ui/icons"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchProvider } from "@/context/search-context"
import { SearchCommand } from "@/components/search-command"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import { NotesProvider } from "@/context/notes-context"
import { EditorNotes } from "@/components/editor-notes"
import { generatePastelColor } from "@/lib/notes"
import { db, type Note, type Vault, type FileSystemTreeNode } from "@/db"
import { createId } from "@paralleldrive/cuid2"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { ReasoningPanel } from "@/components/reasoning-panel"
import { Virtuoso } from "react-virtuoso"
import { Button } from "@/components/ui/button"

interface StreamingDelta {
  suggestion: string
  reasoning: string
}

interface Suggestions {
  suggestions: { suggestion: string }[]
}

interface EditorProps {
  vaultId: string
  vaults: Vault[]
}

interface GeneratedNote {
  title: string
  content: string
}

const MemoizedSidebarTrigger = memo(function MemoizedSidebarTrigger(
  props: React.ComponentProps<typeof Button>,
) {
  const sidebarTrigger = useMemo(() => <SidebarTrigger {...props} />, [props])
  return sidebarTrigger
})

const NoteCardSkeleton = ({ color = "bg-muted/10" }: { color?: string }) => {
  // Generate random rotation between -2.5 and 2.5 degrees for natural look
  const rotation = (Math.random() * 5 - 2.5).toFixed(2)
  // Generate shadow offset for 3D effect
  const x = Math.floor(Math.random() * 3) + 2
  const y = Math.floor(Math.random() * 3) + 2

  const skeletons = useMemo(
    () => (
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    ),
    [],
  )

  return (
    <div
      style={{
        boxShadow: `${x}px ${y}px 8px rgba(0,0,0,0.15)`,
        backgroundImage: `
          radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px),
          radial-gradient(rgba(0,0,0,0.07) 1px, transparent 1px)
        `,
        backgroundSize: "20px 20px, 10px 10px",
        backgroundPosition: "-10px -10px, 0px 0px",
        transform: `rotate(${rotation}deg)`,
        transition: "all 0.3s ease-in-out",
      }}
      className={cn(
        "p-4 border border-border transition-all",
        "shadow-md",
        "cursor-default",
        "animate-shimmer",
        color,
        "w-full mb-4",
        "notecard-ragged relative rounded-sm",
        "before:content-[''] before:absolute before:inset-0 before:z-[-1]",
        "before:opacity-50 before:mix-blend-multiply before:bg-noise-pattern",
        "after:content-[''] after:absolute after:bottom-[-8px] after:right-[-8px]",
        "after:left-[8px] after:top-[8px] after:z-[-2] after:bg-black/10",
      )}
    >
      {skeletons}
    </div>
  )
}

const MemoizedNoteGroup = memo(
  ({
    dateStr,
    dateNotes,
    reasoning,
    currentFile,
    vaultId,
    handleNoteDropped,
    handleCollapseComplete,
    onNoteRemoved,
    formatDate,
    isGenerating = false,
  }: {
    dateStr: string
    dateNotes: Note[]
    reasoning:
      | {
          id: string
          content: string
          reasoningElapsedTime: number
        }
      | undefined
    currentFile: string
    vaultId: string | undefined
    handleCollapseComplete: () => void
    handleNoteDropped: (note: Note) => void
    onNoteRemoved: (noteId: string) => void
    formatDate: (dateStr: string) => React.ReactNode
    isGenerating?: boolean
  }) => {
    // Memoize the callbacks to ensure they have stable references
    const stableHandleNoteDropped = useCallback(
      (note: Note) => {
        handleNoteDropped(note)
      },
      [handleNoteDropped],
    )

    const stableOnNoteRemoved = useCallback(
      (noteId: string) => {
        onNoteRemoved(noteId)
      },
      [onNoteRemoved],
    )

    const memoizedNotes = useMemo(() => {
      return dateNotes.map((note) => ({
        ...note,
        color: note.color ?? generatePastelColor(),
      }))
    }, [dateNotes])

    const memoizedReasoningPanel = useMemo(() => {
      if (!reasoning) return null
      return (
        <div className="px-2 bg-background border-b">
          <ReasoningPanel
            reasoning={reasoning.content}
            isStreaming={false}
            isComplete={true}
            currentFile={currentFile}
            vaultId={vaultId}
            reasoningId={reasoning.id}
            shouldExpand={false}
            onCollapseComplete={handleCollapseComplete}
            elapsedTime={reasoning.reasoningElapsedTime || 0}
          />
        </div>
      )
    }, [reasoning, currentFile, vaultId, handleCollapseComplete])

    return (
      <div className="space-y-4">
        <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground font-medium border-y border-border">
          {formatDate(dateStr)}
        </div>

        {/* Show reasoning panel for this note group if available */}
        {memoizedReasoningPanel}

        <div className="grid gap-4">
          {memoizedNotes.map((note) => (
            <DraggableNoteCard
              key={note.id}
              note={note}
              noteId={note.id}
              handleNoteDropped={stableHandleNoteDropped}
              onNoteRemoved={stableOnNoteRemoved}
              isGenerating={isGenerating}
            />
          ))}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if the notes have changed or the reasoning has changed
    return (
      prevProps.dateStr === nextProps.dateStr &&
      prevProps.dateNotes === nextProps.dateNotes &&
      prevProps.reasoning === nextProps.reasoning &&
      prevProps.currentFile === nextProps.currentFile &&
      prevProps.isGenerating === nextProps.isGenerating
    )
  },
)
MemoizedNoteGroup.displayName = "MemoizedNoteGroup"

// Add a memoized component for individual note cards
const DraggableNoteCard = memo(
  ({
    note,
    noteId,
    handleNoteDropped,
    onNoteRemoved,
    onCurrentGenerationNote,
    isGenerating,
  }: {
    note: Note
    noteId: string
    handleNoteDropped: (note: Note) => void
    onNoteRemoved: (noteId: string) => void
    onCurrentGenerationNote?: (note: Note) => void
    isGenerating: boolean
  }) => {
    const handleDragEnd = useCallback(
      (e: React.DragEvent) => {
        if (e.dataTransfer.dropEffect === "move") {
          onNoteRemoved(noteId)
          onCurrentGenerationNote?.(note)
          handleNoteDropped(note)
        }
      },
      [onNoteRemoved, handleNoteDropped, noteId, note, onCurrentGenerationNote],
    )

    return (
      <div draggable={true} onDragEnd={handleDragEnd}>
        <NoteCard className="w-full" note={note} isGenerating={isGenerating} />
      </div>
    )
  },
)
DraggableNoteCard.displayName = "DraggableNoteCard"

// Add this memoized component after DraggableNoteCard
const DroppedNotesStack = memo(
  ({
    droppedNotes,
    isStackExpanded,
    onToggleExpand,
  }: {
    droppedNotes: Note[]
    isStackExpanded: boolean
    onToggleExpand: () => void
  }) => {
    const renderHoverCard = useCallback(
      (note: Note, index: number) => (
        <HoverCard key={note.id} openDelay={100} closeDelay={100} defaultOpen={isStackExpanded}>
          <HoverCardTrigger asChild>
            <div
              className={cn(
                `absolute shadow-md w-8 h-8 rounded-md transition-all duration-300 ease-in-out ${note.color} flex items-center justify-center hover:z-50 cursor-pointer`,
                isStackExpanded && "shadow-lg right-0",
              )}
              style={{
                top: isStackExpanded ? `${index * 45}px` : index * 3,
                right: isStackExpanded ? 0 : index * 3,
                transform: isStackExpanded ? "rotate(0deg)" : `rotate(${index * 2}deg)`,
                zIndex: droppedNotes.length - index,
                transitionDelay: `${index * 30}ms`,
                ...(isStackExpanded
                  ? {}
                  : droppedNotes.length > 1
                    ? {
                        ["--explode-y" as any]: `${index * 45}px`,
                      }
                    : {}),
              }}
              onClick={(e) => {
                // Prevent triggering parent click
                e.stopPropagation()
                // TODO: Clicking -> embeddings search
                console.log(`Note ID: ${note.id}, Content: ${note.content}, Color: ${note.color}`)
              }}
            >
              <div className="relative z-10 text-sm p-1">{index + 1}</div>
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="left" className="w-64">
            <p className="text-sm">{note.content}</p>
          </HoverCardContent>
        </HoverCard>
      ),
      [isStackExpanded, droppedNotes.length],
    )

    return (
      <div
        className={cn(
          "absolute top-4 right-4 z-20 notes-stack transition-transform",
          isStackExpanded && "expanded-stack",
        )}
        onClick={onToggleExpand}
        title={isStackExpanded ? "Collapse notes" : "Expand notes"}
      >
        <div
          className={cn(
            "overflow-auto scrollbar-hidden pb-4",
            isStackExpanded ? "max-h-60" : "max-h-40",
          )}
          style={{
            overflowY: "auto",
            overflowX: "visible",
            scrollBehavior: "smooth",
            maxHeight: isStackExpanded ? "30vh" : "auto",
          }}
        >
          {droppedNotes.map((note, index) => renderHoverCard(note, index))}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if the notes array has changed in length or content
    if (prevProps.droppedNotes.length !== nextProps.droppedNotes.length) {
      return false // Re-render if number of notes changed
    }
    if (prevProps.isStackExpanded !== nextProps.isStackExpanded) {
      return false // Re-render if expansion state changed
    }

    // Check if any note content or IDs have changed
    return prevProps.droppedNotes.every((prevNote, index) => {
      const nextNote = nextProps.droppedNotes[index]
      return prevNote.id === nextNote.id && prevNote.color === nextNote.color
    })
  },
)
DroppedNotesStack.displayName = "DroppedNotesStack"

export default memo(function Editor({ vaultId, vaults }: EditorProps) {
  const { theme } = useTheme()
  // PERF: should not call it here, or figure out a way not to calculate the vault twice
  const { refreshVault, flattenedFileIds } = useVaultContext()
  const [currentFile, setCurrentFile] = useState<string>("Untitled")
  const [isEditMode, setIsEditMode] = useState(true)
  const [previewNode, setPreviewNode] = useState<Root | null>(null)
  const [isNotesLoading, setIsNotesLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [currentFileHandle, setCurrentFileHandle] = useState<FileSystemFileHandle | null>(null)

  const { settings } = usePersistedSettings()
  const codeMirrorViewRef = useRef<EditorView | null>(null)
  const readingModeRef = useRef<HTMLDivElement>(null)
  const [showNotes, setShowNotes] = useState(false)
  const toggleNotes = useCallback(() => {
    setShowNotes((prev) => {
      // Reset reasoning state when hiding notes panel
      if (prev) {
        setStreamingReasoning("")
        setReasoningComplete(false)
      }
      return !prev
    })
  }, [])

  const [notes, setNotes] = useState<Note[]>([])
  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [notesError, setNotesError] = useState<string | null>(null)
  const [droppedNotes, setDroppedNotes] = useState<Note[]>([])
  const [streamingReasoning, setStreamingReasoning] = useState<string>("")
  const [reasoningComplete, setReasoningComplete] = useState(false)
  const [numSuggestions, setNumSuggestions] = useState(4) // Default number of suggestions
  const [currentReasoningElapsedTime, setCurrentReasoningElapsedTime] = useState(0)
  const virtuosoRef = useRef<any>(null)
  const notesContainerRef = useRef<HTMLDivElement>(null)

  const [reasoningHistory, setReasoningHistory] = useState<
    {
      id: string
      content: string
      timestamp: Date
      noteIds: string[]
      reasoningElapsedTime: number
    }[]
  >([])
  const [currentReasoningId, setCurrentReasoningId] = useState<string>("")
  const [currentlyGeneratingDateKey, setCurrentlyGeneratingDateKey] = useState<string | null>(null)
  const [isStackExpanded, setIsStackExpanded] = useState(false)
  const [streamingSuggestionColors, setStreamingSuggestionColors] = useState<string[]>([])
  // Add a state to track current generation notes
  const [currentGenerationNotes, setCurrentGenerationNotes] = useState<Note[]>([])

  const toggleStackExpand = useCallback(() => {
    setIsStackExpanded((prev) => !prev)
  }, [])

  const vault = vaults.find((v) => v.id === vaultId)

  const contentRef = useRef({ content: "", filename: "" })

  // Mermaid reference for rendering diagrams
  const mermaidRef = useRef<any>(null)
  useEffect(() => {
    // Try to load mermaid dynamically if it's available in the window
    if (typeof window !== "undefined" && window.mermaid) {
      mermaidRef.current = window.mermaid
    }
  }, [])

  const handleNoteDropped = useCallback((note: Note) => {
    setDroppedNotes((prev) => {
      if (prev.find((n) => n.id === note.id)) return prev
      return [...prev, note]
    })
  }, [])

  useEffect(() => {
    contentRef.current = { content: markdownContent, filename: currentFile }
  }, [markdownContent, currentFile])

  // Sort notes from latest to oldest
  useEffect(() => {
    if (currentFile && vault) {
      db.notes
        .where("fileId")
        .equals(currentFile)
        .toArray()
        .then((loadedNotes) => {
          const sortedNotes = loadedNotes.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          setNotes(sortedNotes)
        })
    }
  }, [currentFile, vault])

  const handleExportMarkdown = useCallback(() => {
    const { content, filename } = contentRef.current
    const blob = new Blob([md(content).content], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const updatePreview = useCallback(
    async (value: string) => {
      try {
        const tree = await mdToHtml({
          value,
          settings,
          vaultId,
          filename: currentFile,
          returnHast: true,
        })
        setPreviewNode(tree)
      } catch (error) {
        console.log(error)
      }
    },
    [currentFile, settings, vaultId],
  )

  const onContentChange = useCallback(
    async (value: string) => {
      setMarkdownContent(value)
      if (value !== markdownContent) {
        setHasUnsavedChanges(true)
      }

      const timeoutId = setTimeout(() => updatePreview(value), 100)

      return () => clearTimeout(timeoutId)
    },
    [updatePreview, markdownContent],
  )

  const fetchNewNotes = useCallback(
    async (
      content: string,
      num_suggestions: number = 4,
    ): Promise<{
      generatedNotes: GeneratedNote[]
      reasoningId: string
      reasoningElapsedTime: number
      reasoningContent: string
    }> => {
      try {
        const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT
        if (!apiEndpoint) {
          throw new Error("Notes functionality is currently unavailable")
        }

        // Create a new reasoning ID for this generation
        const reasoningId = createId()

        // Reset states for new generation
        setStreamingReasoning("")
        setReasoningComplete(false)
        setNumSuggestions(num_suggestions)
        setCurrentReasoningElapsedTime(0) // Reset elapsed time at the start

        // Set a current date key for the new notes group with 15-second interval
        const now = new Date()
        const seconds = now.getSeconds()
        const interval = Math.floor(seconds / 15) * 15
        const dateKey = `${now.toDateString()}-${now.getHours()}-${now.getMinutes()}-${interval}`
        setCurrentlyGeneratingDateKey(dateKey)

        const essay = md(content).content
        const max_tokens = 8192

        // Start timing reasoning phase
        const reasoningStartTime = Date.now()
        let reasoningEndTime: number | null = null

        // Create streaming request
        const response = await fetch(`${apiEndpoint}/suggests`, {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ essay, num_suggestions, max_tokens }),
        })

        if (!response.ok) throw new Error("Failed to fetch suggestions")
        if (!response.body) throw new Error("Response body is empty")

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        // We'll collect all suggestion JSON data here
        let suggestionString = ""
        let inReasoningPhase = true
        let collectedReasoning = ""

        // Generate and preserve colors for each suggestion
        const colors = Array(num_suggestions)
          .fill(null)
          .map(() => generatePastelColor())
        setStreamingSuggestionColors(colors)

        // Process the stream
        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })

          // Process each line
          for (const line of chunk.split("\n")) {
            if (!line.trim()) continue

            try {
              const delta: StreamingDelta = JSON.parse(line)

              // Handle reasoning phase
              if (delta.reasoning) {
                collectedReasoning += delta.reasoning
                setStreamingReasoning((prev) => prev + delta.reasoning)
              }

              // Check for phase transition
              if (delta.reasoning === "" && delta.suggestion !== "") {
                // First time we see suggestion means reasoning is complete
                if (inReasoningPhase) {
                  // Record when reasoning phase ended
                  if (!reasoningEndTime) {
                    reasoningEndTime = Date.now()
                    // Calculate and update elapsed time when reasoning ends
                    const elapsedTime = Math.round((reasoningEndTime - reasoningStartTime) / 1000)
                    setCurrentReasoningElapsedTime(elapsedTime)
                  }
                  setReasoningComplete(true)
                  inReasoningPhase = false
                }

                // Collect suggestion data
                suggestionString += delta.suggestion
              }
            } catch (e) {
              console.log("Error parsing line:", e)
            }
          }
        }

        // Ensure we mark reasoning as complete
        if (inReasoningPhase) {
          // If we never set the end time but are now complete, set it
          if (!reasoningEndTime) {
            reasoningEndTime = Date.now()
            // Calculate and update elapsed time when reasoning ends
            const elapsedTime = Math.round((reasoningEndTime - reasoningStartTime) / 1000)
            setCurrentReasoningElapsedTime(elapsedTime)
          }
          setReasoningComplete(true)
        }

        // Calculate elapsed time for reasoning
        const reasoningElapsedTime = Math.round((reasoningEndTime! - reasoningStartTime) / 1000)
        setCurrentReasoningElapsedTime(reasoningElapsedTime)

        // At this point we have the complete reasoning, but we don't yet know which notes it produced
        // We'll update reasoningHistory later when we know the noteIds
        setCurrentReasoningId(reasoningId)

        // Clean up
        reader.releaseLock()

        // Parse collected suggestions
        let generatedNotes: GeneratedNote[] = []

        if (suggestionString.trim()) {
          try {
            const suggestionData: Suggestions = JSON.parse(suggestionString.trim())

            if (suggestionData.suggestions && Array.isArray(suggestionData.suggestions)) {
              generatedNotes = suggestionData.suggestions.map((suggestion, index) => ({
                title: `suggestion ${index + 1}`,
                content: suggestion.suggestion,
              }))
            }
          } catch (e) {
            console.error("Error parsing suggestions:", e)
          }
        }

        if (generatedNotes.length === 0) {
          // Set error state when no suggestions could be generated
          setNotesError("Could not generate suggestions for this content")
          setCurrentlyGeneratingDateKey(null)
        } else {
          // Save the reasoning content to be associated with the notes later
          const reasoningData = {
            id: reasoningId,
            content: collectedReasoning,
            timestamp: new Date(),
            noteIds: [], // Will be populated after creating notes
            reasoningElapsedTime,
          }
          setReasoningHistory((prev) => [...prev, { ...reasoningData }])
          setNotesError(null)
        }

        return {
          generatedNotes,
          reasoningId,
          reasoningElapsedTime,
          reasoningContent: collectedReasoning,
        }
      } catch (error) {
        setNotesError("Notes not available, try again later")
        setReasoningComplete(true)
        setCurrentlyGeneratingDateKey(null)
        throw error
      }
    },
    [],
  )

  // Group notes by date for display (more granular - by minute)
  const groupNotesByDate = useCallback((notesList: Note[]) => {
    const groups: { [key: string]: Note[] } = {}

    notesList.forEach((note) => {
      const date = new Date(note.createdAt)
      // Format with hours, minutes, and 15-second intervals
      const seconds = date.getSeconds()
      const interval = Math.floor(seconds / 15) * 15
      const dateKey = `${date.toDateString()}-${date.getHours()}-${date.getMinutes()}-${interval}`

      if (!groups[dateKey]) {
        groups[dateKey] = []
      }

      groups[dateKey].push(note)
    })

    return Object.entries(groups).sort((a, b) => {
      // Sort from newest to oldest
      const dateA = new Date(a[0].split("-")[0])
      const hourA = parseInt(a[0].split("-")[1])
      const minuteA = parseInt(a[0].split("-")[2])
      const secondsA = parseInt(a[0].split("-")[3] || "0")
      const dateB = new Date(b[0].split("-")[0])
      const hourB = parseInt(b[0].split("-")[1])
      const minuteB = parseInt(b[0].split("-")[2])
      const secondsB = parseInt(b[0].split("-")[3] || "0")

      if (dateA.getTime() === dateB.getTime()) {
        if (hourA === hourB) {
          if (minuteA === minuteB) {
            return secondsB - secondsA // If same minute, sort by seconds interval
          }
          return minuteB - minuteA // If same hour, sort by minute
        }
        return hourB - hourA // If same day, sort by hour
      }
      return dateB.getTime() - dateA.getTime() // Otherwise sort by date
    })
  }, [])

  // Format date for display
  const formatDate = useCallback((dateStr: string) => {
    // Split the dateStr to get the date part, hour part, minute part, and second interval part
    const [datePart, hourPart, minutePart, secondsPart] = dateStr.split("-")
    const date = new Date(datePart)
    const hour = parseInt(hourPart)
    const minute = parseInt(minutePart)
    const seconds = secondsPart ? parseInt(secondsPart) : 0

    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Format as MM/DD/YYYY
    const formattedDate = `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")}/${date.getFullYear()}`

    // Format hour and minute (12-hour format with AM/PM)
    const formattedTime = `${hour % 12 === 0 ? 12 : hour % 12}:${minute.toString().padStart(2, "0")}${seconds > 0 ? `:${seconds}` : ""}${hour < 12 ? "AM" : "PM"}`

    // Calculate relative time indicator
    let relativeTime = ""
    if (date.toDateString() === today.toDateString()) {
      if (today.getHours() === hour) {
        if (today.getMinutes() === minute) {
          const secondsDiff = today.getSeconds() - seconds
          if (secondsDiff < 60) {
            if (secondsDiff === 0) {
              relativeTime = "just now"
            } else if (secondsDiff === 1) {
              relativeTime = "1 second ago"
            } else {
              relativeTime = `${secondsDiff} seconds ago`
            }
          }
        } else {
          const minuteDiff = today.getMinutes() - minute
          if (minuteDiff === 0) {
            relativeTime = "just now"
          } else if (minuteDiff === 1) {
            relativeTime = "1 minute ago"
          } else {
            relativeTime = `${minuteDiff} minutes ago`
          }
        }
      } else if (today.getHours() - hour === 1) {
        relativeTime = "1 hour ago"
      } else {
        relativeTime = `${today.getHours() - hour} hours ago`
      }
    } else if (date.toDateString() === yesterday.toDateString()) {
      relativeTime = "yesterday"
    } else {
      const diffTime = Math.abs(today.getTime() - date.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      relativeTime = `${diffDays} days ago`
    }

    return (
      <div className="flex justify-between items-center w-full">
        <span>
          {formattedDate} {formattedTime}
        </span>
        <span className="text-xs text-muted-foreground italic">{relativeTime}</span>
      </div>
    )
  }, [])

  const handleSave = useCallback(async () => {
    try {
      let targetHandle = currentFileHandle

      if (!targetHandle) {
        targetHandle = await window.showSaveFilePicker({
          id: vaultId,
          suggestedName: currentFile.endsWith(".md") ? currentFile : `${currentFile}.md`,
          types: [
            {
              description: "Markdown Files",
              accept: { "text/markdown": [".md"] },
            },
          ],
        })
      }

      const writable = await targetHandle.createWritable()
      await writable.write(markdownContent)
      await writable.close()

      if (!currentFileHandle && vault) {
        setCurrentFileHandle(targetHandle)
        setCurrentFile(targetHandle.name)

        await refreshVault(vault.id)
      }

      setHasUnsavedChanges(false)
    } catch {}
  }, [currentFileHandle, markdownContent, currentFile, vault, refreshVault, vaultId])

  const memoizedExtensions = useMemo(() => {
    const tabSize = new Compartment()

    return [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      frontmatter(),
      EditorView.lineWrapping,
      tabSize.of(EditorState.tabSize.of(settings.tabSize)),
      fileField.init(() => currentFile),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          const newFilename = update.state.field(fileField)
          setCurrentFile(newFilename)
        }
      }),
      syntaxHighlighting(),
      vim(),
    ]
  }, [settings.tabSize, currentFile])

  useEffect(() => {
    if (markdownContent) {
      updatePreview(markdownContent)
      window.dispatchEvent(new CustomEvent("mermaid-content", { detail: true }))
    }
  }, [markdownContent, updatePreview])

  const onFileSelect = useCallback((handle: FileSystemFileHandle) => {
    setCurrentFileHandle(handle)
    setCurrentFile(handle.name)
    setIsEditMode(false)
  }, [])

  const onNewFile = useCallback(() => {
    setCurrentFileHandle(null)
    setCurrentFile("Untitled")
    setIsEditMode(false)
  }, [])

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      if (event.key === settings.notePanelShortcut && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleNotes()
      } else if (event.key === settings.editModeShortcut && (event.metaKey || event.altKey)) {
        event.preventDefault()
        setIsEditMode((prev) => !prev)
        const nodes = document.querySelectorAll<HTMLDivElement>("pre > code.mermaid")
        // Safely try to render mermaid diagrams if available
        try {
          if (mermaidRef.current) await mermaidRef.current.run({ nodes })
        } catch {}
      } else if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        handleSave()
      }
    },
    [handleSave, toggleNotes, settings],
  )

  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !codeMirrorViewRef.current) return

      try {
        const file = await node.handle.getFile()
        const content = await file.text()

        codeMirrorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: codeMirrorViewRef.current.state.doc.length,
            insert: content,
          },
          effects: setFile.of(file.name),
        })

        setCurrentFileHandle(node.handle as FileSystemFileHandle)
        setCurrentFile(file.name)
        setMarkdownContent(content)
        setHasUnsavedChanges(false)
        setIsEditMode(false)
        updatePreview(content)
      } catch {
        //TODO: do something with the error
      }
    },
    [vault, codeMirrorViewRef, updatePreview, setHasUnsavedChanges],
  )

  // Effect to update vim mode when settings change, with keybinds
  useEffect(() => {
    Vim.defineEx("w", "w", handleSave)
    Vim.defineEx("wa", "w", handleSave)
    Vim.map(";", ":", "normal")
    Vim.map("jj", "<Esc>", "insert")
    Vim.map("jk", "<Esc>", "insert")

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave, toggleNotes, settings, handleKeyDown])

  useEffect(() => {
    if (!showNotes) return

    // First load notes from DB when the notes panel is opened
    if (currentFile && vault) {
      db.notes
        .where("fileId")
        .equals(currentFile)
        .toArray()
        .then((loadedNotes) => {
          // Sort notes from latest to oldest
          const sortedNotes = loadedNotes.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          setNotes(sortedNotes)
        })
    }
  }, [showNotes, currentFile, vault])

  // Function to generate new suggestions
  const generateNewSuggestions = useCallback(async () => {
    if (!currentFile || !vault || !markdownContent) return

    // Clear any previous current generation notes
    setCurrentGenerationNotes([])
    setNotesError(null)
    setIsNotesLoading(true)
    setStreamingReasoning("")
    setReasoningComplete(false)
    setStreamingSuggestionColors([])

    // Set a current date key for the new notes group with 15-second interval
    const now = new Date()
    const seconds = now.getSeconds()
    const interval = Math.floor(seconds / 15) * 15
    const dateKey = `${now.toDateString()}-${now.getHours()}-${now.getMinutes()}-${interval}`
    setCurrentlyGeneratingDateKey(dateKey)

    try {
      const { generatedNotes, reasoningId, reasoningElapsedTime, reasoningContent } =
        await fetchNewNotes(markdownContent)
      const newNoteIds: string[] = []

      const newNotes: Note[] = generatedNotes.map((note, index) => {
        const id = createId()
        newNoteIds.push(id)
        return {
          id,
          content: note.content,
          // Use preserved color or generate a new one
          color: streamingSuggestionColors[index] || generatePastelColor(),
          fileId: currentFile,
          vaultId: vault.id,
          isInEditor: false,
          createdAt: new Date(),
          lastModified: new Date(),
          reasoningId: reasoningId,
        }
      })

      // Add the note IDs to the reasoning history
      setReasoningHistory((prev) =>
        prev.map((r) => (r.id === reasoningId ? { ...r, noteIds: newNoteIds } : r)),
      )

      // Save reasoning to the database with note IDs and elapsed time
      db.saveReasoning({
        id: reasoningId,
        fileId: currentFile,
        vaultId: vault.id,
        content: reasoningContent,
        noteIds: newNoteIds,
        createdAt: new Date(),
        duration: reasoningElapsedTime,
      }).catch((err) => {
        console.error("Failed to save reasoning:", err)
      })

      await Promise.all(newNotes.map((note) => db.notes.add(note)))

      // Set current generation notes
      setCurrentGenerationNotes(newNotes)

      // Also add the new notes to the notes array for historical view
      // (they will remain visible in the current generation section first)
      setNotes((prev) => {
        const combined = [...newNotes, ...prev]
        return combined.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
      })
    } catch (error) {
      // Just show error for current generation and don't affect previous notes
      setNotesError("Notes not available for this generation, try again later")
      setCurrentlyGeneratingDateKey(null)
      console.error("Failed to generate notes:", error)
    } finally {
      // Still set isNotesLoading to false, but don't clear currentlyGeneratingDateKey
      // so that the panel stays visible
      setIsNotesLoading(false)
    }
  }, [currentFile, vault, markdownContent, fetchNewNotes, streamingSuggestionColors])

  const handleCollapseComplete = useCallback(() => {}, [])

  // Generate skeletons based on num_suggestions
  const renderNotesSkeletons = useCallback(() => {
    // Fallback to empty skeletons if no streaming suggestions yet
    return Array.from({ length: numSuggestions }).map((_, i) => {
      // Use the preserved color for this suggestion or generate a new one
      const bgColor = streamingSuggestionColors[i] || generatePastelColor()

      return <NoteCardSkeleton key={i} color={bgColor} />
    })
  }, [numSuggestions, streamingSuggestionColors])

  // Fetch notes and associated reasoning history when the file changes or when notes panel opens
  useEffect(() => {
    if (!currentFile || !vault) return

    const loadNotesAndReasoning = async () => {
      try {
        // First load all notes for this file
        const loadedNotes = await db.notes.where("fileId").equals(currentFile).toArray()

        // Sort notes from latest to oldest
        const sortedNotes = loadedNotes.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        setNotes(sortedNotes)

        // Get unique reasoning IDs from the notes
        const reasoningIds = [
          ...new Set(sortedNotes.filter((n) => n.reasoningId).map((n) => n.reasoningId)),
        ].filter((id): id is string => id !== undefined)

        if (reasoningIds.length > 0) {
          // Fetch all reasonings associated with these notes
          const reasonings = await db.reasonings.where("id").anyOf(reasoningIds).toArray()

          // Map reasonings to the format used in state
          const reasoningHistoryData = reasonings.map((r) => ({
            id: r.id,
            content: r.content,
            timestamp: r.createdAt,
            noteIds: loadedNotes.filter((n) => n.reasoningId === r.id).map((n) => n.id),
            reasoningElapsedTime: r.duration || 0,
          }))

          // Update reasoning history state
          setReasoningHistory(reasoningHistoryData)
        }
      } catch (error) {
        console.error("Error loading notes and reasoning:", error)
      }
    }

    loadNotesAndReasoning()
  }, [currentFile, vault, showNotes])

  // Handle removing a note from the notes array
  const handleNoteRemoved = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }, [])

  // Calculate note data for Virtuoso - only include historical notes
  const noteGroupsData = useMemo(() => {
    // Filter out current generation notes and dropped notes
    const currentGenerationNoteIds = new Set(currentGenerationNotes.map((note) => note.id))
    const droppedNoteIds = new Set(droppedNotes.map((note) => note.id))

    // Filter out both current generation notes and dropped notes
    const filteredNotes = notes.filter(
      (note) => !currentGenerationNoteIds.has(note.id) && !droppedNoteIds.has(note.id),
    )

    return groupNotesByDate(filteredNotes)
  }, [notes, currentGenerationNotes, droppedNotes, groupNotesByDate])

  return (
    <DndProvider backend={HTML5Backend}>
      <NotesProvider>
        <SearchProvider vault={vault!}>
          <SidebarProvider defaultOpen={false}>
            <Explorer
              vault={vault!}
              editorViewRef={codeMirrorViewRef}
              onFileSelect={onFileSelect}
              onNewFile={onNewFile}
              onContentUpdate={updatePreview}
              onExportMarkdown={handleExportMarkdown}
            />
            <SidebarInset className="flex flex-col h-screen overflow-hidden">
              <header className="sticky top-0 h-10 border-b bg-background z-10">
                <div className="h-full flex shrink-0 items-center justify-between mx-4">
                  <MemoizedSidebarTrigger className="-ml-1" title="Open Explorer" />
                  <Toolbar toggleNotes={toggleNotes} />
                </div>
              </header>
              <section className="flex flex-1 overflow-hidden m-4 rounded-md border">
                <div className="flex-1 relative">
                  <EditorNotes />
                  {droppedNotes.length > 0 && (
                    <DroppedNotesStack
                      droppedNotes={droppedNotes}
                      isStackExpanded={isStackExpanded}
                      onToggleExpand={toggleStackExpand}
                    />
                  )}
                  {/* Action Buttons Group */}
                  {(showNotes || droppedNotes.length > 0) && (
                    <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
                      {droppedNotes.length > 0 && (
                        <button
                          onClick={toggleStackExpand}
                          className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                          title={isStackExpanded ? "Collapse notes stack" : "Expand notes stack"}
                        >
                          {isStackExpanded ? <Cross2Icon /> : <StackIcon />}
                        </button>
                      )}
                      {showNotes && (
                        <button
                          onClick={generateNewSuggestions}
                          disabled={isNotesLoading}
                          className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Generate Suggestions"
                        >
                          <ShadowInnerIcon className={notes.length == 0 ? "animate-shimmer" : ""} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="absolute top-4 left-4 text-sm/7 z-10 flex items-center gap-2">
                    {hasUnsavedChanges && <DotIcon className="text-yellow-200" />}
                  </div>
                  <div
                    className={`editor-mode absolute inset-0 ${isEditMode ? "block" : "hidden"}`}
                  >
                    <div className="h-full scrollbar-hidden relative">
                      <CodeMirror
                        value={markdownContent}
                        height="100%"
                        autoFocus
                        placeholder={"What's on your mind?"}
                        basicSetup={{
                          rectangularSelection: true,
                          indentOnInput: true,
                          syntaxHighlighting: true,
                          searchKeymap: true,
                          highlightActiveLine: false,
                          highlightSelectionMatches: false,
                        }}
                        indentWithTab={false}
                        extensions={memoizedExtensions}
                        onChange={onContentChange}
                        className="overflow-auto h-full mx-8 scrollbar-hidden pt-4"
                        theme={theme === "dark" ? "dark" : editorTheme}
                        onCreateEditor={(view) => {
                          codeMirrorViewRef.current = view
                        }}
                      />
                    </div>
                  </div>
                  <div
                    className={`reading-mode absolute inset-0 ${isEditMode ? "hidden" : "block overflow-hidden"}`}
                    ref={readingModeRef}
                  >
                    <div className="prose dark:prose-invert h-full mx-8 overflow-auto scrollbar-hidden">
                      <article className="@container h-full max-w-5xl mx-auto scrollbar-hidden">
                        {previewNode && toJsx(previewNode)}
                      </article>
                    </div>
                  </div>
                </div>
                {showNotes && (
                  <div
                    className="w-88 flex flex-col border-l transition-[right,left,width] duration-200 ease-in-out translate-x-[-100%] data-[show=true]:translate-x-0"
                    data-show={showNotes}
                  >
                    <div className="flex-1 overflow-auto scrollbar-hidden p-4 gap-4 mb-4">
                      {/* Show message only when no notes and not loading */}
                      {!isNotesLoading && notes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground p-4">
                          <p className="mb-4">No notes found for this document</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Show current generation group with reasoning panel */}
                          {notesError ? (
                            <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                              {notesError}
                            </div>
                          ) : (
                            <>
                              {/* Create a single scrollable container for both sections */}
                              <div
                                className="h-full flex flex-col overflow-auto scrollbar-hidden scroll-smooth max-h-[calc(100vh-4rem)]"
                                data-role="notes-container"
                                ref={notesContainerRef}
                              >
                                {/* Only show current generation section if there are active notes in it */}
                                {currentlyGeneratingDateKey &&
                                  (isNotesLoading ||
                                    (currentGenerationNotes.length > 0 &&
                                      currentGenerationNotes.some(
                                        (note) => !droppedNotes.some((d) => d.id === note.id),
                                      ))) && (
                                    <div className="space-y-4 flex-shrink-0 mb-6">
                                      <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground font-medium border-y border-border">
                                        {formatDate(currentlyGeneratingDateKey!)}
                                      </div>

                                      <div className="px-2 bg-background border-b">
                                        <ReasoningPanel
                                          reasoning={streamingReasoning}
                                          isStreaming={isNotesLoading && !reasoningComplete}
                                          isComplete={reasoningComplete}
                                          currentFile={currentFile}
                                          vaultId={vault?.id}
                                          reasoningId={currentReasoningId}
                                          shouldExpand={
                                            isNotesLoading || currentGenerationNotes.length > 0
                                          }
                                          onCollapseComplete={handleCollapseComplete}
                                          elapsedTime={currentReasoningElapsedTime}
                                        />
                                      </div>

                                      {/* Show loading skeletons during generation */}
                                      {isNotesLoading && reasoningComplete && !notesError && (
                                        <div className="space-y-4 px-2">
                                          {renderNotesSkeletons()}
                                        </div>
                                      )}

                                      {/* Show actual generated notes when complete */}
                                      {!isNotesLoading &&
                                        currentGenerationNotes.length > 0 &&
                                        !notesError && (
                                          <div className="space-y-4 px-2">
                                            {currentGenerationNotes.map((note) => (
                                              <DraggableNoteCard
                                                key={note.id}
                                                note={{
                                                  ...note,
                                                  color: note.color ?? generatePastelColor(),
                                                }}
                                                noteId={note.id}
                                                handleNoteDropped={handleNoteDropped}
                                                onNoteRemoved={handleNoteRemoved}
                                                onCurrentGenerationNote={(note) => {
                                                  setCurrentGenerationNotes((prev) =>
                                                    prev.filter((n) => n.id !== note.id),
                                                  )
                                                }}
                                                isGenerating={isNotesLoading}
                                              />
                                            ))}
                                          </div>
                                        )}
                                    </div>
                                  )}
                                <div className="flex-1 min-h-0">
                                  {noteGroupsData.length === 0 &&
                                  !isNotesLoading &&
                                  reasoningComplete ? (
                                    <div className="py-4 text-sm text-muted-foreground text-center">
                                      No previous notes
                                    </div>
                                  ) : (
                                    <Virtuoso
                                      key={`note-list-${currentlyGeneratingDateKey || "historical"}`}
                                      style={{ height: "100%", width: "100%" }}
                                      totalCount={noteGroupsData.length}
                                      data={noteGroupsData}
                                      overscan={5}
                                      components={{
                                        EmptyPlaceholder: () => (
                                          <div className="py-4 text-sm text-muted-foreground text-center">
                                            No notes found
                                          </div>
                                        ),
                                        ScrollSeekPlaceholder: ({ height }) => (
                                          <div
                                            className="p-4 border border-border bg-muted/20 flex items-center justify-center"
                                            style={{ height }}
                                          >
                                            <div className="animate-shimmer flex space-x-4 w-full">
                                              <div className="flex-1 space-y-4 py-1">
                                                <div className="h-4 bg-muted rounded w-3/4"></div>
                                                <div className="space-y-2">
                                                  <div className="h-4 bg-muted rounded"></div>
                                                  <div className="h-4 bg-muted rounded w-5/6"></div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ),
                                      }}
                                      itemContent={(_index, group) => {
                                        // Add a safety check for when group is undefined or not properly formed
                                        if (!group || !Array.isArray(group) || group.length < 2) {
                                          return null
                                        }

                                        const [dateStr, dateNotes] = group

                                        // Only handle historical notes now
                                        const dateReasoning = reasoningHistory.find((r) =>
                                          r.noteIds.some((id) =>
                                            dateNotes.some((note) => note.id === id),
                                          ),
                                        )

                                        return (
                                          <div className="mb-6">
                                            <MemoizedNoteGroup
                                              dateStr={dateStr}
                                              dateNotes={dateNotes}
                                              reasoning={dateReasoning}
                                              currentFile={currentFile}
                                              vaultId={vault?.id}
                                              handleNoteDropped={handleNoteDropped}
                                              onNoteRemoved={handleNoteRemoved}
                                              formatDate={formatDate}
                                              isGenerating={false}
                                              handleCollapseComplete={handleCollapseComplete}
                                            />
                                          </div>
                                        )
                                      }}
                                      initialItemCount={1}
                                      increaseViewportBy={{ top: 100, bottom: 100 }}
                                      scrollSeekConfiguration={{
                                        enter: (velocity) => Math.abs(velocity) > 1000,
                                        exit: (velocity) => Math.abs(velocity) < 100,
                                      }}
                                      ref={virtuosoRef}
                                      // Use the parent container as the scroll element
                                      customScrollParent={notesContainerRef.current || undefined}
                                    />
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
              <SearchCommand
                maps={flattenedFileIds}
                vault={vault!}
                onFileSelect={handleFileSelect}
              />
              {("showFooter" in settings ? settings.showFooter !== false : true) && (
                <footer className="sticky bottom-0 h-8 border-t text-xs/8 bg-background z-10">
                  <div
                    className="h-full flex shrink-0 items-center align-middle font-serif justify-end mx-4 gap-4 text-muted-foreground hover:text-accent-foreground cursor-pointer"
                    aria-hidden
                    tabIndex={-1}
                  >
                    <span>{currentFile.replace(".md", "")}</span>
                    <span>{markdownContent.split(/\s+/).filter(Boolean).length} words</span>
                    <span>{markdownContent.length} chars</span>
                    {isEditMode ? (
                      <EyeOpenIcon className="h-3 w-3 p-0" widths={16} height={16} />
                    ) : (
                      <Pencil1Icon className="h-3 w-3 p-0" widths={16} height={16} />
                    )}
                  </div>
                </footer>
              )}
            </SidebarInset>
          </SidebarProvider>
        </SearchProvider>
      </NotesProvider>
    </DndProvider>
  )
})
