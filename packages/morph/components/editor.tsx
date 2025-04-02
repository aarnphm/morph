"use client"

import { cn, sanitizeStreamingContent, toJsx } from "@/lib"
import { generatePastelColor } from "@/lib/notes"
import { groupNotesByDate } from "@/lib/notes"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { createId } from "@paralleldrive/cuid2"
import { CopyIcon, Cross2Icon, GlobeIcon, StackIcon } from "@radix-ui/react-icons"
import { Vim, vim } from "@replit/codemirror-vim"
import CodeMirror from "@uiw/react-codemirror"
import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import type { Root } from "hast"
import { AnimatePresence, motion } from "motion/react"
import { useTheme } from "next-themes"
import * as React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import { CustomDragLayer, EditorDropTarget, Playspace } from "@/components/dnd"
import { fileField, mdToHtml } from "@/components/markdown-inline"
import { setFile } from "@/components/markdown-inline"
import { DroppedNoteGroup } from "@/components/note-group"
import { NotesPanel, StreamingNote } from "@/components/note-panel"
import { theme as editorTheme, frontmatter, md, syntaxHighlighting } from "@/components/parser"
import Rails from "@/components/rails"
import { SearchCommand } from "@/components/search-command"
import SteeringPanel from "@/components/steering-panel"
import { VaultButton } from "@/components/ui/button"
import { DotIcon } from "@/components/ui/icons"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

import { usePGlite } from "@/context/db"
import { SearchProvider } from "@/context/search"
import { SteeringProvider, SteeringSettings } from "@/context/steering"
import { useVaultContext } from "@/context/vault"

import usePersistedSettings from "@/hooks/use-persisted-settings"
import { useToast } from "@/hooks/use-toast"

import type { FileSystemTreeNode, Note, Vault } from "@/db/interfaces"
import * as schema from "@/db/schema"

interface GeneratedNote {
  content: string
}

interface EditorProps {
  vaultId: string
  vaults: Vault[]
}

interface ReasoningHistory {
  id: string
  content: string
  timestamp: Date
  noteIds: string[]
  reasoningElapsedTime: number
  authors?: string[]
  tonality?: Record<string, number>
  temperature?: number
  numSuggestions?: number
}

interface SuggestionRequest {
  essay: string
  authors?: string[]
  tonality?: { [key: string]: number }
  num_suggestions?: number
  temperature?: number
  max_tokens?: number
  usage?: boolean
}

interface ReadinessResponse {
  healthy: boolean
  services: { name: string; healthy: boolean; latency_ms: number; error: string }[]
  timestamp: string
}

interface NewlyGeneratedNotes {
  generatedNotes: GeneratedNote[]
  reasoningId: string
  reasoningElapsedTime: number
  reasoningContent: string
}

// Replace the wrapper component with a direct export of EditorComponent
export default memo(function Editor({ vaultId, vaults }: EditorProps) {
  const { theme } = useTheme()
  const { toast } = useToast()

  const { refreshVault, flattenedFileIds } = useVaultContext()
  const [currentFile, setCurrentFile] = useState<string>("Untitled")
  const [isEditMode, setIsEditMode] = useState(true)
  const [previewNode, setPreviewNode] = useState<Root | null>(null)
  const [isNotesLoading, setIsNotesLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [currentFileHandle, setCurrentFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [scanAnimationComplete, setScanAnimationComplete] = useState(false)
  const [showEphemeralBanner, setShowEphemeralBanner] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const codeMirrorViewRef = useRef<EditorView | null>(null)
  const readingModeRef = useRef<HTMLDivElement>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [notesError, setNotesError] = useState<string | null>(null)
  const [droppedNotes, setDroppedNotes] = useState<Note[]>([])
  const [streamingReasoning, setStreamingReasoning] = useState<string>("")
  const [reasoningComplete, setReasoningComplete] = useState(false)
  const [currentReasoningElapsedTime, setCurrentReasoningElapsedTime] = useState(0)
  const [lastNotesGeneratedTime, setLastNotesGeneratedTime] = useState<Date | null>(null)
  const notesContainerRef = useRef<HTMLDivElement>(null)
  const [reasoningHistory, setReasoningHistory] = useState<ReasoningHistory[]>([])
  const [currentReasoningId, setCurrentReasoningId] = useState<string>("")
  const [currentlyGeneratingDateKey, setCurrentlyGeneratingDateKey] = useState<string | null>(null)
  const [isStackExpanded, setIsStackExpanded] = useState(false)
  const [streamingSuggestionColors, setStreamingSuggestionColors] = useState<string[]>([])
  // Add a state to track current generation notes
  const [currentGenerationNotes, setCurrentGenerationNotes] = useState<Note[]>([])
  const [streamingNotes, setStreamingNotes] = useState<StreamingNote[]>([])
  const [vimMode] = useState(false)

  // State for embedding indicator
  // const [eyeIconState, setEyeIconState] = useState<"open" | "closed">("open")

  const { settings } = usePersistedSettings()
  const client = usePGlite()
  const db = drizzle({ client, schema })

  const toggleStackExpand = useCallback(() => {
    setIsStackExpanded((prev) => !prev)
  }, [])

  // Effect to set isClient to true after component mounts
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Effect to track online/offline status
  useEffect(() => {
    // Only run this effect on the client after it has mounted
    if (!isClient) return

    // Set initial state based on navigator now that we are on the client
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Initial check in case the event listeners haven't fired yet
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
    // Rerun specifically when isClient becomes true to set initial state
  }, [isClient])

  const toggleNotes = useCallback(() => {
    // Check isClient here for safety, though interaction implies client-side
    if (isClient && !isOnline) {
      toast({
        title: "Notes panel requires an internet connection.",
        description: "Please check your connection and try again.",
        duration: 5000,
        variant: "destructive",
      })
      return // Prevent opening the panel
    }

    setShowNotes((prev) => {
      // Reset reasoning state when hiding notes panel
      if (prev) {
        setStreamingReasoning("")
        setReasoningComplete(false)
      }
      return !prev
    })
  }, [isOnline, isClient, toast])

  const vault = vaults.find((v) => v.id === vaultId)

  const contentRef = useRef({ content: "", filename: "" })

  const handleNoteDropped = useCallback(
    async (note: Note) => {
      // Ensure note has a color if it doesn't already
      const noteWithColor = {
        ...note,
        color: note.color || generatePastelColor(),
        dropped: true,
        lastModified: new Date(),
      }

      // Update droppedNotes optimistically without triggering unnecessary motion
      setDroppedNotes((prev) => {
        if (prev.find((n) => n.id === noteWithColor.id)) return prev
        // Add note to the end of the array for proper scroll-to behavior
        return [...prev, noteWithColor]
      })

      // Find the file in the database to get its ID
      try {
        // First, find the file in the database
        const dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) =>
            and(eq(files.name, currentFile), eq(files.vaultId, vault?.id || "")),
        })

        if (!dbFile) {
          console.error("Failed to find file in database when dropping note")
          return
        }

        // Save to database - update the note's dropped flag
        await db
          .update(schema.notes)
          .set({
            dropped: true,
            color: noteWithColor.color,
            accessedAt: new Date(), // Update accessedAt timestamp
            fileId: dbFile.id,
          })
          .where(eq(schema.notes.id, noteWithColor.id))
      } catch (error) {
        console.error("Failed to update note dropped status:", error)
      }
    },
    [db, currentFile, vault],
  )

  useEffect(() => {
    contentRef.current = { content: markdownContent, filename: currentFile }
  }, [markdownContent, currentFile])

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
        console.error(error)
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
      numSuggestions: number,
      steeringOptions?: {
        authors?: string[]
        tonality?: Record<string, number>
        temperature?: number
      },
    ): Promise<NewlyGeneratedNotes> => {
      try {
        const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT || "http://localhost:8000"
        const readyz = await fetch(`${apiEndpoint}/readyz`)
        if (!readyz.ok) {
          throw new Error("Notes functionality is currently unavailable")
        }
        const serviceReadiness: ReadinessResponse = await fetch(`${apiEndpoint}/health`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ timeout: 30 }),
        }).then((data) => data.json())

        // Validate service health status with detailed information
        if (!serviceReadiness.healthy) {
          const unhealthyServices = serviceReadiness.services
            .filter((service) => !service.healthy)
            .map((service) => `${service.name} (${service.error || "Unknown error"})`)
            .join(", ")

          console.error("Service health check failed:", {
            timestamp: serviceReadiness.timestamp,
            overallHealth: serviceReadiness.healthy,
            unhealthyServices,
            allServices: serviceReadiness.services,
          })

          throw new Error(`Services unavailable: ${unhealthyServices}`)
        }

        // Create a new reasoning ID for this generation
        const reasoningId = createId()

        // Reset states for new generation
        setStreamingReasoning("")
        setReasoningComplete(false)
        setCurrentReasoningElapsedTime(0) // Reset elapsed time at the start
        setStreamingNotes([]) // Reset streaming notes
        setScanAnimationComplete(false) // Reset scan animation state

        // Set a current date key for the new notes group with 15-second interval
        const now = new Date()
        const seconds = now.getSeconds()
        const interval = Math.floor(seconds / 15) * 15
        const dateKey = `${now.toDateString()}-${now.getHours()}-${now.getMinutes()}-${interval}`
        setCurrentlyGeneratingDateKey(dateKey)

        const max_tokens = 16384
        const essay = md(content).content
        const request: SuggestionRequest = {
          essay,
          num_suggestions: numSuggestions,
          temperature: steeringOptions?.temperature ?? 0.6,
          max_tokens,
          ...(steeringOptions?.authors && { authors: steeringOptions.authors }),
          ...(steeringOptions?.tonality && { tonality: steeringOptions.tonality }),
          usage: true,
        }

        // Start timing reasoning phase
        const reasoningStartTime = Date.now()
        let reasoningEndTime: number | null = null

        // Create streaming request
        const response = await fetch(`${apiEndpoint}/suggests`, {
          method: "POST",
          headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
          body: JSON.stringify(request),
        })

        if (!response.ok) throw new Error("Failed to fetch suggestions")
        if (!response.body) throw new Error("Response body is empty")

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        // We'll collect all suggestion JSON data here
        let suggestionString = ""
        let inReasoningPhase = true
        let collectedReasoning = ""

        // Initialize variables for streaming JSON parsing
        const colors = Array(numSuggestions)
          .fill(null)
          .map(() => generatePastelColor())
        setStreamingSuggestionColors(colors)

        // Create empty streaming notes with unique IDs
        const initialStreamingNotes = Array(numSuggestions)
          .fill(null)
          .map((_, index) => ({
            id: createId(),
            content: "",
            color: colors[index] || generatePastelColor(),
            isComplete: false,
            isScanComplete: false,
          }))
        setStreamingNotes(initialStreamingNotes)

        // Variables for tracking streaming JSON state
        let currentNoteIndex = 0
        let partialJSON = ""
        let inJsonSuggestion = false
        let currentSuggestion = ""
        let isFirstNote = true

        // Pattern variables that account for whitespace
        const firstNoteStartPattern = '{"suggestions":\\s*\\[\\s*{"suggestion":\\s*"'
        const subsequentNoteStartPattern = '\\s*{"suggestion":\\s*"'
        const endPatternWithComma = '"\\s*}\\s*,'
        const endPatternFinal = '"\\s*}\\s*]\\s*}'

        // Process the stream
        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })

          // Process each line
          for (const line of chunk.split("\n\n")) {
            if (!line.trim()) continue

            try {
              // Assuming delta structure based on previous code
              const delta = JSON.parse(line) as { reasoning?: string; suggestion?: string }

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

                // Handle each delta suggestion chunk for streaming JSON
                // Ensure delta.suggestion is not null/undefined before adding
                const suggestionChunk = delta.suggestion || ""
                partialJSON += suggestionChunk

                // First note has a different start pattern than subsequent ones
                if (!inJsonSuggestion) {
                  if (isFirstNote) {
                    // Check for the first note start pattern
                    const firstStartRegex = new RegExp(firstNoteStartPattern)
                    const match = firstStartRegex.exec(partialJSON)

                    if (match) {
                      inJsonSuggestion = true
                      const matchIndex = match.index + match[0].length
                      currentSuggestion = partialJSON.substring(matchIndex)
                      partialJSON = ""
                      isFirstNote = false
                    }
                  } else {
                    // Check for subsequent note start pattern
                    const subsequentStartRegex = new RegExp(subsequentNoteStartPattern)
                    const match = subsequentStartRegex.exec(partialJSON)

                    if (match) {
                      inJsonSuggestion = true
                      const matchIndex = match.index + match[0].length
                      currentSuggestion = partialJSON.substring(matchIndex)
                      partialJSON = ""
                    }
                  }
                }
                // If we're inside a suggestion object, accumulate content
                else if (inJsonSuggestion) {
                  currentSuggestion += suggestionChunk // Use the checked suggestionChunk

                  // For a better streaming experience, update the note's content with each delta
                  setStreamingNotes((prevNotes) => {
                    if (!prevNotes[currentNoteIndex]) return prevNotes

                    // Create a new array to avoid mutating the previous state
                    const updatedNotes = [...prevNotes]

                    // Only update the current note - this fixes the flashing bug
                    updatedNotes[currentNoteIndex] = {
                      ...updatedNotes[currentNoteIndex],
                      content: sanitizeStreamingContent(currentSuggestion),
                    }

                    return updatedNotes
                  })

                  // Check for end patterns - either with comma (more notes to come) or final closing pattern
                  const endWithCommaRegex = new RegExp(endPatternWithComma)
                  const endFinalRegex = new RegExp(endPatternFinal)

                  const endWithCommaMatch = endWithCommaRegex.exec(currentSuggestion)
                  const endFinalMatch = endFinalRegex.exec(currentSuggestion)

                  // Process if we found either ending pattern
                  if (endWithCommaMatch || endFinalMatch) {
                    // Get the end index based on which pattern matched
                    const match = endWithCommaMatch || endFinalMatch
                    const endIndex = match!.index

                    // Extract the suggestion content up to the end pattern
                    const suggestionContent = currentSuggestion.substring(0, endIndex)

                    // Update the streaming note with the current content
                    setStreamingNotes((prevNotes) => {
                      if (!prevNotes[currentNoteIndex]) return prevNotes

                      // Create a new array to avoid mutating the previous state
                      const updatedNotes = [...prevNotes]

                      // Only update the current note - this fixes the flashing bug
                      updatedNotes[currentNoteIndex] = {
                        ...updatedNotes[currentNoteIndex],
                        content: sanitizeStreamingContent(suggestionContent),
                        isComplete:
                          endFinalMatch !== null && currentNoteIndex === numSuggestions - 1,
                      }

                      return updatedNotes
                    })

                    // Reset suggestion tracking
                    inJsonSuggestion = false

                    // Set remaining text for next iteration
                    const remaining = currentSuggestion.substring(endIndex + match![0].length)
                    partialJSON = remaining
                    currentSuggestion = ""

                    // Move to next note if there's more to process
                    if (endWithCommaMatch) {
                      currentNoteIndex = Math.min(currentNoteIndex + 1, numSuggestions - 1)
                    }
                  }
                }

                // Collect suggestion data for final processing
                suggestionString += suggestionChunk // Use the checked suggestionChunk
              }
            } catch (e) {
              console.error("Error parsing line:", e)
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

        // Mark all streaming notes as complete
        setStreamingNotes((prevNotes) => {
          const allComplete = prevNotes.map((note) => ({ ...note, isComplete: true }))
          return allComplete
        })

        // Calculate elapsed time for reasoning
        const reasoningElapsedTime = Math.round((reasoningEndTime! - reasoningStartTime) / 1000)
        setCurrentReasoningElapsedTime(reasoningElapsedTime)

        // Run scan animation after a small delay
        const runScanAnimation = async () => {
          // Wait a moment before starting the animation
          await new Promise((resolve) => setTimeout(resolve, 300))

          const noteCount = initialStreamingNotes.length // Use initial array length
          for (let i = 0; i < noteCount; i++) {
            setStreamingNotes((prevNotes) => {
              // Important: Always work with the *latest* state inside the loop
              const currentNotes = prevNotes
              const updatedNotes = [...currentNotes]
              if (updatedNotes[i]) {
                updatedNotes[i] = {
                  ...updatedNotes[i],
                  isScanComplete: true,
                }
              }
              return updatedNotes
            })
            // Add a small delay between each note's scan animation for effect
            await new Promise((resolve) => setTimeout(resolve, 50))
          }

          // Set loading to false which will trigger showing the final notes
          setIsNotesLoading(false)
          setScanAnimationComplete(true)
        }

        // Start the scan animation sequence
        runScanAnimation()

        // At this point we have the complete reasoning, but we don't yet know which notes it produced
        // We'll update reasoningHistory later when we know the noteIds
        setCurrentReasoningId(reasoningId)

        // Clean up
        reader.releaseLock()

        // Parse collected suggestions
        let generatedNotes: GeneratedNote[] = []

        if (suggestionString.trim()) {
          try {
            // Assuming 'Suggestions' interface was defined elsewhere or inline
            interface SuggestionsResponse {
              suggestions: { suggestion: string }[]
            }
            const suggestionData: SuggestionsResponse = JSON.parse(suggestionString.trim())

            if (suggestionData.suggestions && Array.isArray(suggestionData.suggestions)) {
              generatedNotes = suggestionData.suggestions.map((suggestion) => ({
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
            // Add steering parameters if they exist
            authors: steeringOptions?.authors,
            tonality: steeringOptions?.tonality && steeringOptions?.tonality,
            temperature: steeringOptions?.temperature,
            numSuggestions: numSuggestions,
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
      } catch (error: any) {
        // Catch specific error type
        setNotesError(`Notes not available: ${error.message || "Unknown error"}`)
        setReasoningComplete(true)
        setCurrentlyGeneratingDateKey(null)
        throw error
      }
    },
    [],
  )

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
            if (secondsDiff <= 1) {
              // Consider 0 or 1 second as "just now"
              relativeTime = "just now"
            } else {
              relativeTime = `${secondsDiff} seconds ago`
            }
          } else {
            relativeTime = "this minute" // If secondsDiff >= 60 but minute is same
          }
        } else {
          const minuteDiff = today.getMinutes() - minute
          if (minuteDiff === 1 && today.getSeconds() < seconds) {
            // Less than a full minute ago
            relativeTime = "just now"
          } else if (minuteDiff === 1) {
            relativeTime = "1 minute ago"
          } else {
            relativeTime = `${minuteDiff} minutes ago`
          }
        }
      } else if (today.getHours() - hour === 1 && 60 - minute + today.getMinutes() < 60) {
        // Less than an hour ago
        relativeTime = `${60 - minute + today.getMinutes()} minutes ago`
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

    const exts = [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      frontmatter(),
      EditorView.lineWrapping,
      tabSize.of(EditorState.tabSize.of(settings.tabSize)),
      fileField.init(() => currentFile),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          // We only update the filename if it explicitly changes via the effect
          // const newFilename = update.state.field(fileField)
          // setCurrentFile(newFilename)
        }
      }),
      syntaxHighlighting(),
    ]
    if (vimMode) exts.push(vim())
    return exts
  }, [settings, currentFile, vimMode])

  useEffect(() => {
    if (markdownContent) {
      updatePreview(markdownContent)
    }
  }, [markdownContent, updatePreview])

  const onNewFile = useCallback(() => {
    setCurrentFileHandle(null)
    setCurrentFile("Untitled")
    setMarkdownContent("") // Clear content for new file
    setIsEditMode(true)
    setPreviewNode(null) // Clear preview
    setNotes([]) // Clear notes associated with previous file
    setDroppedNotes([]) // Clear dropped notes
    setReasoningHistory([]) // Clear reasoning history
    setHasUnsavedChanges(false) // Reset unsaved changes
  }, [])

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      if (event.key === settings.toggleNotes && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleNotes()
      } else if (event.key === settings.toggleEditMode && (event.metaKey || event.altKey)) {
        event.preventDefault()
        setIsEditMode((prev) => !prev)
        // Safely try to render mermaid diagrams if available
      } else if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        handleSave()
      }
    },
    [handleSave, toggleNotes, settings],
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

  const generateNewSuggestions = useCallback(
    async (steeringSettings: SteeringSettings) => {
      if (!currentFile || !vault || !markdownContent) return

      setCurrentGenerationNotes([])
      setNotesError(null)
      setIsNotesLoading(true)
      setStreamingReasoning("")
      setReasoningComplete(false)
      setStreamingSuggestionColors([])
      setScanAnimationComplete(false) // Reset scan animation state
      setLastNotesGeneratedTime(new Date())
      const now = new Date()
      const seconds = now.getSeconds()
      const interval = Math.floor(seconds / 15) * 15
      const dateKey = `${now.toDateString()}-${now.getHours()}-${now.getMinutes()}-${interval}`
      setCurrentlyGeneratingDateKey(dateKey)

      try {
        // First, find or create the file in the database to ensure proper ID reference
        let dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) =>
            and(eq(files.name, currentFile), eq(files.vaultId, vault.id)),
        })

        if (!dbFile) {
          // Extract extension
          const extension = currentFile.includes(".") ? currentFile.split(".").pop() || "" : ""

          // Insert file into database
          await db.insert(schema.files).values({
            name: currentFile,
            extension,
            vaultId: vault.id,
            lastModified: new Date(),
            embeddingStatus: "in_progress",
          })

          // Re-fetch the file to get its ID
          dbFile = await db.query.files.findFirst({
            where: (files, { and, eq }) =>
              and(eq(files.name, currentFile), eq(files.vaultId, vault.id)),
          })

          if (!dbFile) {
            throw new Error("Failed to create file in database")
          }
        }

        // Now that we have the file, generate the suggestions
        const { generatedNotes, reasoningId, reasoningElapsedTime, reasoningContent } =
          await fetchNewNotes(
            markdownContent,
            steeringSettings.numSuggestions,
            steeringSettings
              ? {
                  authors: steeringSettings.authors,
                  tonality: steeringSettings.tonalityEnabled
                    ? steeringSettings.tonality
                    : undefined,
                  temperature: steeringSettings.temperature,
                }
              : undefined,
          )

        const newNoteIds: string[] = []
        const newNotes: Note[] = generatedNotes.map((note, index) => {
          const id = createId()
          newNoteIds.push(id)
          return {
            id,
            content: note.content,
            color: streamingSuggestionColors[index] || generatePastelColor(),
            fileId: dbFile!.id, // Use the actual DB file ID here
            vaultId: vault.id,
            isInEditor: false,
            createdAt: new Date(),
            lastModified: new Date(),
            reasoningId: reasoningId,
            steering: {
              authors: steeringSettings.authors,
              tonality: steeringSettings.tonalityEnabled ? steeringSettings.tonality : undefined,
              temperature: steeringSettings.temperature,
              numSuggestions: steeringSettings.numSuggestions,
            },
            embeddingStatus: "in_progress",
            embeddingTaskId: null,
          }
        })

        // Add note IDs to reasoning history
        setReasoningHistory((prev) =>
          prev.map((r) => (r.id === reasoningId ? { ...r, noteIds: newNoteIds } : r)),
        )

        // Only save if the file is not "Untitled" and we have notes to save
        if (currentFile !== "Untitled" && vault && newNotes.length > 0) {
          try {
            console.debug(`Saving reasoning with file ID: ${dbFile!.id}`)

            // Save reasoning using Drizzle insert
            await db.insert(schema.reasonings).values({
              id: reasoningId,
              fileId: dbFile!.id,
              vaultId: vault.id,
              content: reasoningContent,
              noteIds: newNoteIds,
              createdAt: now,
              accessedAt: now,
              duration: reasoningElapsedTime,
              steering: {
                authors: steeringSettings.authors,
                tonality: steeringSettings.tonalityEnabled ? steeringSettings.tonality : undefined,
                temperature: steeringSettings.temperature,
                numSuggestions: steeringSettings.numSuggestions,
              },
            })

            // Convert to proper database format for insertion
            for (const note of newNotes) {
              await db.insert(schema.notes).values({
                id: note.id,
                content: note.content,
                color: note.color,
                createdAt: note.createdAt,
                accessedAt: new Date(),
                dropped: note.dropped ?? false,
                fileId: dbFile!.id,
                vaultId: note.vaultId,
                reasoningId: note.reasoningId!,
                steering: note.steering!,
                embeddingStatus: "in_progress",
                embeddingTaskId: null,
              })
            }

            console.debug(`Saved ${newNotes.length} notes to database`)

            // Add the newly created notes to our state
            setNotes((prev) => {
              const combined = [...newNotes, ...prev]
              return combined.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              )
            })

            // Set current generation notes for UI
            setCurrentGenerationNotes(newNotes)
          } catch (dbError) {
            console.error("Failed to save notes to database:", dbError)
            // Still show notes in UI even if DB fails
            setCurrentGenerationNotes(newNotes)
            setNotes((prev) => {
              const combined = [...newNotes, ...prev]
              return combined.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              )
            })
          }
        } else {
          // For unsaved files, just display in UI without saving to DB
          setShowEphemeralBanner(true)
          setTimeout(() => setShowEphemeralBanner(false), 7000)
          setCurrentGenerationNotes(newNotes)
          setNotes((prev) => {
            const combined = [...newNotes, ...prev]
            return combined.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )
          })
        }
      } catch (error) {
        setNotesError("Notes not available for this generation, try again later")
        setCurrentlyGeneratingDateKey(null)
        console.error("Failed to generate notes:", error)
      } finally {
        setIsNotesLoading(false)
      }
    },
    [currentFile, vault, markdownContent, fetchNewNotes, streamingSuggestionColors, db],
  )

  // Handle removing a note from the notes array
  const handleNoteRemoved = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }, [])

  const noteGroupsData = useMemo(() => {
    // Filter out current generation notes and dropped notes
    const currentGenerationNoteIds = new Set(currentGenerationNotes.map((note) => note.id))
    const droppedNoteIds = new Set(droppedNotes.map((note) => note.id))

    // Filter out both current generation notes and dropped notes
    const filteredNotes = notes.filter(
      (note) =>
        !currentGenerationNoteIds.has(note.id) && !droppedNoteIds.has(note.id) && !note.dropped,
    )

    return groupNotesByDate(filteredNotes)
  }, [notes, currentGenerationNotes, droppedNotes])

  const handleCurrentGenerationNote = useCallback((note: Note) => {
    setCurrentGenerationNotes((prev) => prev.filter((n) => n.id !== note.id))
  }, [])

  // Memoize dropped notes to prevent unnecessary re-renders
  const memoizedDroppedNotes = useMemo(() => {
    return droppedNotes.map((note) => ({
      ...note,
      color: note.color || generatePastelColor(),
    }))
  }, [droppedNotes])

  // Check if notes were recently generated (within the last 5 minutes)
  // TODO: a small tool calling Qwen to determine if we should recommends users to generate suggestions.
  const isNotesRecentlyGenerated = useMemo(() => {
    if (!lastNotesGeneratedTime) return false
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes in milliseconds
    return lastNotesGeneratedTime > fiveMinutesAgo
  }, [lastNotesGeneratedTime])

  // Handle dragging a dropped note back to the panel
  const handleNoteDragBackToPanel = useCallback(
    async (noteId: string) => {
      // Find the note in the droppedNotes
      const note = droppedNotes.find((n) => n.id === noteId)
      if (!note) {
        console.error(`Note with ID ${noteId} not found in droppedNotes`)
        return
      }

      // Log the action for debugging
      console.debug(`Dragging note ${noteId} back to panel`)

      // Update the note to indicate it's no longer dropped
      const undropNote = {
        ...note,
        dropped: false,
        lastModified: new Date(),
      }

      // Remove from droppedNotes state
      setDroppedNotes((prev) => prev.filter((n) => n.id !== noteId))

      try {
        // Find the file in the database to make sure we have the right reference
        const dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) =>
            and(eq(files.name, currentFile), eq(files.vaultId, vault?.id || "")),
        })

        if (!dbFile) {
          console.error("Failed to find file in database when undropping note")
          return
        }

        // Update the database
        await db
          .update(schema.notes)
          .set({
            dropped: false,
            accessedAt: new Date(),
            fileId: dbFile.id, // Ensure we're using the database file ID
          })
          .where(eq(schema.notes.id, noteId))

        console.debug(`Successfully updated note ${noteId} status to not dropped`)

        // Add back to main notes collection if not already there
        setNotes((prevNotes) => {
          // If it exists, just update its dropped status
          if (prevNotes.some((n) => n.id === noteId)) {
            console.debug(`Note ${noteId} already exists in notes, updating dropped status`)
            return prevNotes.map((n) => (n.id === noteId ? { ...n, dropped: false } : n))
          } else {
            // Add to the beginning of the notes array to make it appear at the top
            return [undropNote, ...prevNotes]
          }
        })
      } catch (error) {
        console.error("Failed to update note status:", error)
      }
    },
    [droppedNotes, db, currentFile, vault, setNotes],
  )

  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !codeMirrorViewRef.current) return

      try {
        const file = await node.handle!.getFile()
        const content = await file.text()
        const fileName = file.name

        // Update CodeMirror
        codeMirrorViewRef.current.dispatch({
          changes: { from: 0, to: codeMirrorViewRef.current.state.doc.length, insert: content },
          // Update the file field using the effect
          effects: setFile.of(fileName),
        })

        // Update component state first to show content
        setCurrentFileHandle(node.handle as FileSystemFileHandle)
        setCurrentFile(fileName)
        setMarkdownContent(content)
        setHasUnsavedChanges(false)
        setIsEditMode(true)
        updatePreview(content)

        // Clear any current generation states
        setCurrentGenerationNotes([])
        setCurrentlyGeneratingDateKey(null)
        setNotesError(null)

        // Reset note states first to prevent stale data
        setNotes([])
        setDroppedNotes([])
        setReasoningHistory([])

        // Check if file exists in database
        let dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) => and(eq(files.name, fileName), eq(files.vaultId, vault.id)),
        })

        // If file doesn't exist in DB, create it
        if (!dbFile) {
          // Extract extension
          const extension = fileName.includes(".") ? fileName.split(".").pop() || "" : ""

          try {
            // Insert file into database
            await db.insert(schema.files).values({
              name: fileName,
              extension,
              vaultId: vault.id,
              lastModified: new Date(),
              embeddingStatus: "in_progress",
            })

            // Re-fetch the file to get its ID
            dbFile = await db.query.files.findFirst({
              where: (files, { and, eq }) =>
                and(eq(files.name, fileName), eq(files.vaultId, vault.id)),
            })

            console.debug(`Created new file in database: ${fileName}`)
          } catch (dbError) {
            console.error("Error inserting file into database:", dbError)
          }
        }

        // Fetch notes associated with this file from the database
        if (dbFile) {
          try {
            console.debug(`Loading notes for file ID: ${dbFile.id}`)

            // Query all notes for this file using the proper Drizzle syntax
            const fileNotes = await db
              .select()
              .from(schema.notes)
              .where(and(eq(schema.notes.fileId, dbFile.id), eq(schema.notes.vaultId, vault.id)))

            if (fileNotes && fileNotes.length > 0) {
              console.debug(`Found ${fileNotes.length} notes for file ${fileName}`)

              // Separate notes into regular and dropped notes
              const regularNotes = fileNotes.filter((note) => !note.dropped)
              const droppedNotesList = fileNotes.filter((note) => note.dropped)

              console.debug(
                `Regular notes: ${regularNotes.length}, Dropped notes: ${droppedNotesList.length}`,
              )

              // Properly prepare notes for the UI by adding display properties
              const uiReadyRegularNotes = regularNotes.map((note) => ({
                ...note,
                color: note.color || generatePastelColor(),
                lastModified: new Date(note.accessedAt),
              }))

              const uiReadyDroppedNotes = droppedNotesList.map((note) => ({
                ...note,
                color: note.color || generatePastelColor(),
                lastModified: new Date(note.accessedAt),
              }))

              // Update the state with fetched notes
              setNotes(uiReadyRegularNotes)
              setDroppedNotes(uiReadyDroppedNotes)

              // Fetch related reasonings if needed
              const reasoningIds = [...new Set(fileNotes.map((note) => note.reasoningId))]
              if (reasoningIds.length > 0) {
                const reasonings = await db
                  .select()
                  .from(schema.reasonings)
                  .where(inArray(schema.reasonings.id, reasoningIds))

                if (reasonings && reasonings.length > 0) {
                  // Convert to ReasoningHistory format and update state
                  const reasoningHistory = reasonings.map((r) => ({
                    id: r.id,
                    content: r.content,
                    timestamp: r.createdAt,
                    noteIds: fileNotes.filter((n) => n.reasoningId === r.id).map((n) => n.id),
                    reasoningElapsedTime: r.duration,
                    authors: r.steering?.authors,
                    tonality: r.steering?.tonality,
                    temperature: r.steering?.temperature,
                    numSuggestions: r.steering?.numSuggestions,
                  }))

                  setReasoningHistory(reasoningHistory)
                }
              }
            } else {
              console.debug(`No notes found for file ${fileName}`)
            }
          } catch (error) {
            console.error("Error fetching notes for file:", error)
          }
        }
      } catch (error) {
        console.error("Error handling file selection:", error)
        toast({
          title: "Error Loading File",
          description: `Could not load file ${node.name}. Please try again.`,
          variant: "destructive",
        })
      }
    },
    [vault, updatePreview, toast, db],
  )

  return (
    <DndProvider backend={HTML5Backend}>
      <SteeringProvider>
        <CustomDragLayer />
        <SearchProvider vault={vault!}>
          <SidebarProvider defaultOpen={false} className="flex min-h-screen">
            <Rails
              vault={vault!}
              editorViewRef={codeMirrorViewRef}
              onFileSelect={handleFileSelect}
              onNewFile={onNewFile}
              onContentUpdate={updatePreview}
            />
            <SidebarInset className="flex flex-col h-screen flex-1 overflow-hidden">
              <Playspace vaultId={vaultId}>
                <AnimatePresence>
                  {showEphemeralBanner && (
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-md shadow-md text-xs flex items-center space-x-2"
                    >
                      <span>
                        📝 Suggestions are ephemeral and will be{" "}
                        <span className="text-red-400">lost</span> unless the file is saved (
                        <kbd>⌘ s</kbd>)
                      </span>
                      <button
                        onClick={() => setShowEphemeralBanner(false)}
                        className="text-yellow-800 hover:text-yellow-900 hover:cursor-pointer"
                        aria-label="Dismiss notification"
                      >
                        <Cross2Icon className="w-3 h-3" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <EditorDropTarget handleNoteDropped={handleNoteDropped}>
                  <AnimatePresence>
                    {memoizedDroppedNotes.length > 0 && (
                      <DroppedNoteGroup
                        droppedNotes={memoizedDroppedNotes}
                        isStackExpanded={isStackExpanded}
                        onExpandStack={toggleStackExpand}
                        onDragBackToPanel={handleNoteDragBackToPanel}
                        className="before:mix-blend-multiply before:bg-noise-pattern"
                      />
                    )}
                  </AnimatePresence>
                  {showNotes && <SteeringPanel />}
                  <div className="flex flex-col items-center space-y-2 absolute bottom-4 right-4 z-20">
                    {droppedNotes.length > 0 && (
                      <VaultButton
                        onClick={toggleStackExpand}
                        color="orange"
                        size="small"
                        title={isStackExpanded ? "Collapse notes stack" : "Expand notes stack"}
                      >
                        {isStackExpanded ? (
                          <Cross2Icon className="w-3 h-3" />
                        ) : (
                          <StackIcon className="w-3 h-3" />
                        )}
                      </VaultButton>
                    )}
                    <VaultButton
                      className={cn(
                        isClient &&
                          (isNotesLoading || !isOnline) &&
                          "opacity-50 cursor-not-allowed",
                      )} // Conditionally apply style based on isClient
                      onClick={toggleNotes}
                      disabled={!isClient || isNotesLoading || !isOnline} // Disable if not client, loading, or offline
                      size="small"
                      // Adjust title based on client state as well
                      title={
                        showNotes
                          ? "Hide Notes"
                          : isClient && isOnline
                            ? "Show Notes"
                            : isClient && !isOnline
                              ? "Notes unavailable offline"
                              : "Loading..."
                      }
                    >
                      <CopyIcon className="w-3 h-3" />
                    </VaultButton>
                  </div>
                  <div className="absolute top-4 left-4 text-sm/7 z-10 flex flex-col items-center gap-2">
                    {hasUnsavedChanges && <DotIcon className="text-yellow-200" />}
                    {isClient && !isOnline && <GlobeIcon className="w-4 h-4 text-destructive" />}
                    {/* {isEmbeddingInProgress && ( */}
                    {/*   <> */}
                    {/*     {eyeIconState === "open" ? ( */}
                    {/*       <EyeOpenIcon className="w-4 h-4 text-blue-400 animate-pulse" /> */}
                    {/*     ) : ( */}
                    {/*       <EyeClosedIcon className="w-4 h-4 text-blue-400/70" /> */}
                    {/*     )} */}
                    {/*   </> */}
                    {/* )} */}
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
                    <div className="prose dark:prose-invert h-full mr-8 overflow-auto scrollbar-hidden">
                      <article className="@container h-full max-w-5xl mx-auto scrollbar-hidden mt-4">
                        {previewNode && toJsx(previewNode)}
                      </article>
                    </div>
                  </div>
                </EditorDropTarget>
                <AnimatePresence mode="wait">
                  {showNotes && (
                    <motion.div
                      key="notes-panel"
                      initial={{ width: 0, opacity: 0, overflow: "hidden" }}
                      animate={{
                        width: "22rem",
                        opacity: 1,
                        overflow: "visible",
                      }}
                      exit={{
                        width: 0,
                        opacity: 0,
                        overflow: "hidden",
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                        opacity: { duration: 0.2 },
                      }}
                      layout
                    >
                      <NotesPanel
                        notes={notes}
                        isNotesLoading={isNotesLoading}
                        notesError={notesError}
                        currentlyGeneratingDateKey={currentlyGeneratingDateKey}
                        currentGenerationNotes={currentGenerationNotes}
                        droppedNotes={droppedNotes}
                        streamingReasoning={streamingReasoning}
                        reasoningComplete={reasoningComplete}
                        currentFile={currentFile}
                        vaultId={vault?.id}
                        currentReasoningId={currentReasoningId}
                        reasoningHistory={reasoningHistory}
                        handleNoteDropped={handleNoteDropped}
                        handleNoteRemoved={handleNoteRemoved}
                        handleCurrentGenerationNote={handleCurrentGenerationNote}
                        formatDate={formatDate}
                        isNotesRecentlyGenerated={isNotesRecentlyGenerated}
                        currentReasoningElapsedTime={currentReasoningElapsedTime}
                        generateNewSuggestions={generateNewSuggestions}
                        noteGroupsData={noteGroupsData}
                        notesContainerRef={notesContainerRef}
                        streamingNotes={streamingNotes}
                        scanAnimationComplete={scanAnimationComplete}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Playspace>
              <SearchCommand
                maps={flattenedFileIds}
                vault={vault!}
                onFileSelect={handleFileSelect}
              />
            </SidebarInset>
          </SidebarProvider>
        </SearchProvider>
      </SteeringProvider>
    </DndProvider>
  )
})
