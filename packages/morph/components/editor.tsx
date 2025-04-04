"use client"

import { cn, sanitizeStreamingContent, toJsx } from "@/lib"
import { generatePastelColor } from "@/lib/notes"
import { groupNotesByDate } from "@/lib/notes"
import {
  GeneratedNote,
  NewlyGeneratedNotes,
  SuggestionRequest,
  SuggestionResponse,
  checkAgentAvailability,
  checkAgentHealth,
} from "@/services/agents"
import { submitContentForAuthors } from "@/services/authors"
import { checkFileHasEmbeddings, useProcessPendingEssayEmbeddings } from "@/services/essays"
import {
  checkNoteHasEmbedding,
  submitNoteForEmbedding,
  useProcessPendingEmbeddings,
} from "@/services/notes"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { Compartment, EditorState } from "@codemirror/state"
import { keymap } from "@codemirror/view"
import { EditorView } from "@codemirror/view"
import { createId } from "@paralleldrive/cuid2"
import { CopyIcon, Cross2Icon, GlobeIcon } from "@radix-ui/react-icons"
import { Vim, vim } from "@replit/codemirror-vim"
import { hyperLink } from "@uiw/codemirror-extensions-hyper-link"
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

import { AuthorProcessor } from "@/components/author-processor"
import ContextNotes from "@/components/context-notes"
import { CustomDragLayer, EditorDropTarget, Playspace } from "@/components/dnd"
import { EmbeddingStatus } from "@/components/embedding-status"
import { EssayEmbeddingProcessor } from "@/components/essay-embedding-processor"
import { fileField, mdToHtml } from "@/components/markdown-inline"
import { setFile } from "@/components/markdown-inline"
import { NoteEmbeddingProcessor } from "@/components/note-embedding-processor"
import { DroppedNoteGroup } from "@/components/note-group"
import { NotesPanel, StreamingNote } from "@/components/note-panel"
import { theme as editorTheme, frontmatter, md, syntaxHighlighting } from "@/components/parser"
import { search } from "@/components/parser/codemirror"
import Rails from "@/components/rails"
import { SearchCommand } from "@/components/search-command"
import { SettingsPanel } from "@/components/settings-panel"
import { VaultButton } from "@/components/ui/button"
import { DotIcon } from "@/components/ui/icons"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

import { useAuthorTasks } from "@/context/authors"
import { usePGlite } from "@/context/db"
import { useEmbeddingTasks, useEssayEmbeddingTasks } from "@/context/embedding"
import { useRestoredFile } from "@/context/file-restoration"
import { SearchProvider } from "@/context/search"
import { SteeringProvider, SteeringSettings } from "@/context/steering"
import { useVaultContext } from "@/context/vault"
import { verifyHandle } from "@/context/vault-reducer"

import useFsHandles from "@/hooks/use-fs-handles"
import usePersistedSettings from "@/hooks/use-persisted-settings"
import { useToast } from "@/hooks/use-toast"

import type { FileSystemTreeNode, Note, Vault } from "@/db/interfaces"
import * as schema from "@/db/schema"

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

export interface AuthorRequest {
  essay: string
  authors?: string[]
  num_authors?: number
  temperature?: number
  max_tokens?: number
  search_backend?: "exa"
  num_search_results?: number
}

// Replace the wrapper component with a direct export of EditorComponent
export default memo(function Editor({ vaultId, vaults }: EditorProps) {
  const { theme } = useTheme()
  const { toast } = useToast()
  const { storeHandle } = useFsHandles()
  const { restoredFile, setRestoredFile } = useRestoredFile()
  const { settings } = usePersistedSettings()

  const { refreshVault, flattenedFileIds } = useVaultContext()
  const [currentFile, setCurrentFile] = useState<string>("Untitled")
  const [isEditMode, setIsEditMode] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
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
  const [vimMode, setVimMode] = useState(settings.vimMode ?? false)
  // Add a ref to track if we've already attempted to restore a file
  const fileRestorationAttempted = useRef(false)
  // Add state to show vim mode change notification
  const [showVimModeChangeNotification, setShowVimModeChangeNotification] = useState(false)
  const [currentFileId, setCurrentFileId] = useState<string | null>(null)
  // Add a state for visible context note IDs (around line 150, with other state declarations)
  const [visibleContextNoteIds, setVisibleContextNoteIds] = useState<string[]>([])

  // Add a ref to track loaded files to prevent duplicate note loading
  const loadedFiles = useRef<Set<string>>(new Set())

  const client = usePGlite()
  const db = drizzle({ client, schema })

  const vault = vaults.find((v) => v.id === vaultId)

  // Add the process pending embeddings mutation
  const processEmbeddings = useProcessPendingEmbeddings()

  // Add the process pending embeddings mutation for essays
  const processEssayEmbeddings = useProcessPendingEssayEmbeddings()

  // Get the task actions for adding tasks
  const { addTask, pendingTaskIds } = useEmbeddingTasks()
  const { addTask: addEssayTask, pendingTaskIds: essayPendingTaskIds } = useEssayEmbeddingTasks()
  const { addTask: addAuthorTask } = useAuthorTasks()

  const toggleStackExpand = useCallback(() => {
    setIsStackExpanded((prev) => !prev)
  }, [])

  // Effect to set isClient to true after component mounts
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Add a ref to track initial settings load
  const initialSettingsLoadComplete = useRef(false)

  // Effect to update vimMode state when settings change
  useEffect(() => {
    // Only show notification if this isn't the initial settings load
    if (settings.vimMode !== vimMode) {
      setVimMode(settings.vimMode ?? false)

      // Only show notification if initial settings have already been loaded once
      if (initialSettingsLoadComplete.current) {
        setShowVimModeChangeNotification(true)
      } else {
        // Mark that we've completed the initial settings load
        initialSettingsLoadComplete.current = true
      }
    }
  }, [settings.vimMode, vimMode])

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

  // Helper function to load file content and UI state
  const loadFileContent = useCallback(
    (fileName: string, fileHandle: FileSystemFileHandle, content: string) => {
      if (!codeMirrorViewRef.current) return false

      try {
        // Update CodeMirror
        codeMirrorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: codeMirrorViewRef.current.state.doc.length,
            insert: content,
          },
          effects: setFile.of(fileName),
        })

        // Update state
        setCurrentFileHandle(fileHandle)
        setCurrentFile(fileName)
        setMarkdownContent(content)
        setHasUnsavedChanges(false)
        setIsEditMode(true)

        // Update preview
        updatePreview(content)

        return true
      } catch (error) {
        console.error("Error loading file content:", error)
        return false
      }
    },
    [updatePreview],
  )

  // Helper function to load file metadata (notes, reasonings, etc.)
  const loadFileMetadata = useCallback(
    async (fileName: string) => {
      if (!vault) return

      try {
        // Find the file in database
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
          } catch (dbError) {
            console.error("Error inserting file into database:", dbError)
            return // Exit early if we can't create the file
          }
        }

        // Only continue if we have a valid file reference
        if (!dbFile) {
          console.error("Failed to find or create file in database")
          return
        }

        // Fetch notes associated with this file in a single query
        try {
          // Query all notes for this file
          const fileNotes = await db
            .select()
            .from(schema.notes)
            .where(and(eq(schema.notes.fileId, dbFile.id), eq(schema.notes.vaultId, vault.id)))

          if (fileNotes && fileNotes.length > 0) {
            // Process notes and reasoning in parallel
            // Separate notes into regular and dropped notes
            const regularNotes = fileNotes.filter((note) => !note.dropped)
            const droppedNotesList = fileNotes.filter((note) => note.dropped)

            // Prepare notes for the UI
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

            // Update the state with fetched notes in a non-blocking way
            setNotes(uiReadyRegularNotes)
            setDroppedNotes(uiReadyDroppedNotes)

            // In parallel, fetch and process reasoning if needed
            const reasoningIds = [...new Set(fileNotes.map((note) => note.reasoningId))]
            if (reasoningIds.length > 0) {
              const reasonings = await db
                .select()
                .from(schema.reasonings)
                .where(inArray(schema.reasonings.id, reasoningIds))

              if (reasonings && reasonings.length > 0) {
                // Convert to ReasoningHistory format
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

                // Update reasoning history state in a non-blocking way
                React.startTransition(() => {
                  setReasoningHistory(reasoningHistory)
                })
              }
            }
          }
        } catch (error) {
          console.error("Error fetching notes for file:", error)
        }
      } catch (dbError) {
        console.error("Error with database operations:", dbError)
      }
    },
    [db, vault],
  )

  // Helper function to load file metadata with deduplication
  const loadFileMetadataOnce = useCallback(
    async (fileName: string) => {
      // Create a unique key for this file
      const fileKey = `${vaultId}:${fileName}`

      // Skip if we've already loaded this file
      if (loadedFiles.current.has(fileKey)) return

      // Mark file as loaded before we start loading to prevent race conditions
      loadedFiles.current.add(fileKey)

      try {
        await loadFileMetadata(fileName)
      } catch (error) {
        // If loading fails, remove from the loaded set so we can try again
        loadedFiles.current.delete(fileKey)
        console.error(`[Debug] Error loading file metadata for ${fileName}:`, error)
      }
    },
    [vaultId, loadFileMetadata],
  )

  // Effect to use preloaded file from context if available
  useEffect(() => {
    if (!isClient || !restoredFile || fileRestorationAttempted.current) return

    // Update local state even before CodeMirror is ready
    setCurrentFile(restoredFile.fileName)
    setMarkdownContent(restoredFile.content)
    setCurrentFileHandle(restoredFile.fileHandle)
    setHasUnsavedChanges(false)

    // Reset all notes states in one batch to ensure clean state for the restored file
    setCurrentGenerationNotes([])
    setCurrentlyGeneratingDateKey(null)
    setNotesError(null)
    setNotes([])
    setDroppedNotes([])
    setReasoningHistory([])

    // Reset the processing flags to ensure new embeddings are processed
    embeddingProcessedRef.current = false
    essayEmbeddingProcessedRef.current = false

    // If CodeMirror is ready, also update it
    if (codeMirrorViewRef.current) {
      loadFileContent(restoredFile.fileName, restoredFile.fileHandle, restoredFile.content)

      // Load file metadata once
      loadFileMetadataOnce(restoredFile.fileName)

      // Process essay embeddings for restored file (only if online)
      if (isOnline && vault) {
        // Use a small timeout to let the file load completely first
        setTimeout(async () => {
          try {
            // Find the file in the database to get its ID
            const dbFile = await db.query.files.findFirst({
              where: (files, { and, eq }) =>
                and(eq(files.name, restoredFile.fileName), eq(files.vaultId, vault.id)),
            })

            if (dbFile) {
              // Check if this file already has embeddings
              const hasEmbeddings = await checkFileHasEmbeddings(db, dbFile.id)

              if (!hasEmbeddings) {
                // Process essay embeddings asynchronously using the md content function
                const content = md(restoredFile.content).content
                processEssayEmbeddings.mutate({
                  addTask: addEssayTask,
                  currentContent: content,
                  currentVaultId: vault.id,
                  currentFileId: dbFile.id,
                })
              }

              // Process any existing notes for this file
              processEmbeddings.mutate({ addTask })
            }

            // Also process author recommendations if online
            if (!authorsProcessedRef.current && dbFile) {
              try {
                // Get the file content
                const fileContent = md(restoredFile.content).content
                const taskId = await submitContentForAuthors(db, dbFile.id, fileContent)
                if (taskId) {
                  addAuthorTask(taskId, dbFile.id)
                  authorsProcessedRef.current = true
                }
              } catch (error) {
                console.error("[Editor] Error processing authors:", error)
              }
            }
          } catch (error) {
            console.error("Error processing file data:", error)
          }
        }, 1000) // 1 second delay to ensure DB operations are ready
      }
    }

    // Mark file as restored so we don't try again
    fileRestorationAttempted.current = true
  }, [
    isClient,
    setRestoredFile,
    restoredFile,
    loadFileContent,
    loadFileMetadataOnce,
    isOnline,
    vault,
    db,
    processEmbeddings,
    processEssayEmbeddings,
    addTask,
    addEssayTask,
    addAuthorTask,
  ])

  // Reset loaded files cache when vault changes
  useEffect(() => {
    loadedFiles.current.clear()
  }, [vaultId])

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

    // Instead of using setState callback, directly use a variable for performance
    const shouldShowNotes = !showNotes

    // If we're hiding the panel
    if (!shouldShowNotes) {
      // Reset reasoning state
      setStreamingReasoning("")
      setReasoningComplete(false)
      setNotesError(null) // Reset error state when closing panel

      // Synchronize current generation notes with history if they exist
      if (currentGenerationNotes.length > 0 && currentlyGeneratingDateKey) {
        // Process the notes synchronously, rather than in state updater
        // Filter out any duplicates that might already exist
        const notesToAdd = currentGenerationNotes.filter(
          (note) => !notes.some((existingNote) => existingNote.id === note.id),
        )

        if (notesToAdd.length > 0) {
          // Add to notes and sort by creation date
          const combined = [...notesToAdd, ...notes]
          const sorted = combined.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          setNotes(sorted)
        }

        // Save notes to database if the file isn't "Untitled" and we have a vault
        if (currentFile !== "Untitled" && vault) {
          // We use a self-executing async function to avoid making the whole callback async
          ;(async () => {
            try {
              // First, find the file in database
              const dbFile = await db.query.files.findFirst({
                where: (files, { and, eq }) =>
                  and(eq(files.name, currentFile), eq(files.vaultId, vault.id)),
              })

              if (!dbFile) {
                console.error("Failed to find file in database when synchronizing notes")
                return
              }

              // Get the current reasoning for these notes
              const currentReasoning = reasoningHistory.find((r) => r.id === currentReasoningId)
              if (currentReasoning && currentReasoningId) {
                // Check if reasoning exists in database
                const existingReasoning = await db.query.reasonings.findFirst({
                  where: eq(schema.reasonings.id, currentReasoningId),
                })

                // If reasoning doesn't exist yet, create it
                if (!existingReasoning && currentReasoning) {
                  // Get note IDs for the reasoning
                  const noteIds = currentGenerationNotes.map((note) => note.id)

                  // Insert reasoning with properly typed steering (can be null)
                  await db.insert(schema.reasonings).values({
                    id: currentReasoningId,
                    fileId: dbFile.id,
                    vaultId: vault.id,
                    content: currentReasoning.content,
                    noteIds: noteIds,
                    createdAt: currentReasoning.timestamp,
                    accessedAt: new Date(),
                    duration: currentReasoning.reasoningElapsedTime,
                    steering: currentGenerationNotes[0]?.steering || null,
                  })
                }
              }

              // For each note, ensure it's saved to database if not already
              for (const note of currentGenerationNotes) {
                // Check if note exists in database
                const existingNote = await db.query.notes.findFirst({
                  where: eq(schema.notes.id, note.id),
                })

                if (!existingNote) {
                  // Insert note with properly typed steering (can be null)
                  await db.insert(schema.notes).values({
                    id: note.id,
                    content: note.content,
                    color: note.color,
                    createdAt: note.createdAt,
                    accessedAt: new Date(),
                    dropped: note.dropped ?? false,
                    fileId: dbFile.id,
                    vaultId: note.vaultId,
                    reasoningId: note.reasoningId!,
                    steering: note.steering || null,
                    embeddingStatus: "in_progress",
                    embeddingTaskId: null,
                  })
                }
              }

              // Process notes for embedding one by one and set up polling
              for (const note of currentGenerationNotes) {
                const hasEmbedding = await checkNoteHasEmbedding(db, note.id)
                if (!hasEmbedding) {
                  const result = await submitNoteForEmbedding(db, note)

                  // If successful and we have a task ID, add it for polling
                  if (result) {
                    // Wait a small amount of time to ensure DB updates are complete
                    await new Promise((resolve) => setTimeout(resolve, 100))

                    const updatedNote = await db.query.notes.findFirst({
                      where: eq(schema.notes.id, note.id),
                    })

                    if (updatedNote?.embeddingTaskId) {
                      addTask(updatedNote.embeddingTaskId)
                    }
                  }
                }
              }
            } catch (error) {
              console.error("Failed to sync notes to database:", error)
            }
          })()
        }

        // Reset current generation state to prevent duplication when reopening
        setCurrentGenerationNotes([])
        setCurrentlyGeneratingDateKey(null)
      }
    } else {
      // When opening the notes panel, check for notes that need embeddings
      // but only process once per file to avoid excessive processing
      if (notes.length > 0 && !embeddingProcessedRef.current) {
        processEmbeddings.mutate({ addTask })
        embeddingProcessedRef.current = true
      }
    }

    // Update state after all synchronous operations
    setShowNotes(shouldShowNotes)
  }, [
    isOnline,
    isClient,
    toast,
    currentGenerationNotes,
    currentlyGeneratingDateKey,
    currentFile,
    vault,
    db,
    currentReasoningId,
    reasoningHistory,
    processEmbeddings,
    addTask,
    notes,
    showNotes,
  ])

  const contentRef = useRef({ content: "", filename: "" })

  const handleNoteDropped = useCallback(
    async (note: Note) => {
      // Ensure note has a color if it doesn't already
      const noteWithColor = {
        ...note,
        color: note.color || generatePastelColor(),
        dropped: true,
        lastModified: new Date(),
        // Preserve existing embedding status or set to "in_progress" if undefined
        embeddingStatus: note.embeddingStatus || "in_progress",
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
            // Only update embeddingStatus if it's not already set
            ...(noteWithColor.embeddingStatus !== "success" && { embeddingStatus: "in_progress" }),
          })
          .where(eq(schema.notes.id, noteWithColor.id))

        // After updating the note's dropped status, check if it needs embedding
        // If it doesn't already have an embedding, submit it
        const hasEmbedding = await checkNoteHasEmbedding(db, noteWithColor.id)
        if (!hasEmbedding) {
          // Get the full note with all fields
          const fullNote = await db.query.notes.findFirst({
            where: eq(schema.notes.id, noteWithColor.id),
          })

          if (fullNote) {
            // Submit for embedding and get task ID
            const result = await submitNoteForEmbedding(db, fullNote)

            // If successful, update the local state with the latest status
            if (result) {
              // Wait a small amount of time to ensure DB updates are complete
              await new Promise((resolve) => setTimeout(resolve, 100))

              // Get the updated note with task ID
              const updatedNote = await db.query.notes.findFirst({
                where: eq(schema.notes.id, noteWithColor.id),
              })

              if (updatedNote?.embeddingTaskId) {
                addTask(updatedNote.embeddingTaskId)

                // Update dropped notes with the new status and task ID
                setDroppedNotes((prev) =>
                  prev.map((n) =>
                    n.id === noteWithColor.id
                      ? {
                          ...n,
                          embeddingStatus: "in_progress",
                          embeddingTaskId: updatedNote.embeddingTaskId,
                        }
                      : n,
                  ),
                )
              }
            } else {
              // Update dropped notes to show failure
              setDroppedNotes((prev) =>
                prev.map((n) =>
                  n.id === noteWithColor.id ? { ...n, embeddingStatus: "failure" } : n,
                ),
              )
            }
          }
        } else {
          // Update dropped notes to show success
          setDroppedNotes((prev) =>
            prev.map((n) => (n.id === noteWithColor.id ? { ...n, embeddingStatus: "success" } : n)),
          )
        }
      } catch (error) {
        console.error("Failed to update note dropped status:", error)
        // Update dropped notes to show failure
        setDroppedNotes((prev) =>
          prev.map((n) => (n.id === noteWithColor.id ? { ...n, embeddingStatus: "failure" } : n)),
        )
      }
    },
    [db, currentFile, vault, addTask],
  )

  useEffect(() => {
    contentRef.current = { content: markdownContent, filename: currentFile }
  }, [markdownContent, currentFile])

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

        const isAgentAvailable = await checkAgentAvailability()
        if (!isAgentAvailable) {
          throw new Error("Agent service is not available. Please try again later.")
        }

        // Check agent health to ensure it's functioning properly
        const healthStatus = await checkAgentHealth()
        if (!healthStatus.healthy) {
          const unhealthyServices = healthStatus.services
            .filter((service) => !service.healthy)
            .map((service) => `${service.name} (${service.error || "Unknown error"})`)
            .join(", ")

          console.error("Service health check failed:", {
            timestamp: healthStatus.timestamp,
            overallHealth: healthStatus.healthy,
            unhealthyServices,
            allServices: healthStatus.services,
          })

          const errorMsg = `Services unavailable: ${unhealthyServices}`
          toast({
            title: "Service Health Error",
            description: errorMsg,
            variant: "destructive",
            duration: 5000,
          })
          throw new Error(errorMsg)
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

        // Add dropped notes to the request if there are any
        if (droppedNotes.length > 0) {
          request.notes = droppedNotes.map((note) => ({
            vault_id: note.vaultId,
            file_id: note.fileId,
            note_id: note.id,
            content: note.content,
          }))
        }

        // Start timing reasoning phase
        const reasoningStartTime = Date.now()
        let reasoningEndTime: number | null = null

        // Create streaming request
        let response: Response
        try {
          response = await fetch(`${apiEndpoint}/suggests`, {
            method: "POST",
            headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
            body: JSON.stringify(request),
          })

          if (!response.ok) {
            const errorMsg = `Failed to fetch suggestions: ${response.statusText || "Unknown error"}`
            toast({
              title: "Suggestion Error",
              description: errorMsg,
              variant: "destructive",
              duration: 5000,
            })
            throw new Error(errorMsg)
          }

          if (!response.body) {
            const errorMsg = "Response body is empty"
            toast({
              title: "Empty Response",
              description: errorMsg,
              variant: "destructive",
              duration: 5000,
            })
            throw new Error(errorMsg)
          }
        } catch (suggestError: any) {
          const errorMsg = `Failed to get suggestions: ${suggestError.message || "Unknown error"}`
          toast({
            title: "Suggestion Error",
            description: errorMsg,
            variant: "destructive",
            duration: 5000,
          })
          throw new Error(errorMsg)
        }

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
                    let suggestionContent = currentSuggestion.substring(0, endIndex)

                    // Update the streaming note with the current content
                    setStreamingNotes((prevNotes) => {
                      if (!prevNotes[currentNoteIndex]) return prevNotes

                      // Create a new array to avoid mutating the previous state
                      const updatedNotes = [...prevNotes]

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

                    // Important: Clear both variables to prevent flashing
                    currentSuggestion = ""
                    suggestionContent = ""
                    partialJSON = ""

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
              // Clean up on error to avoid stuck partial content
              partialJSON = ""
              currentSuggestion = ""
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
          const noteCount = initialStreamingNotes.length
          let currentDelay = 100
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
            // Gradually reduce the delay for a smooth acceleration effect
            currentDelay = Math.max(10, currentDelay * 0.85)
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
            const suggestionData: SuggestionResponse = JSON.parse(suggestionString.trim())

            if (suggestionData.suggestions && Array.isArray(suggestionData.suggestions)) {
              generatedNotes = suggestionData.suggestions.map((suggestion) => ({
                content: suggestion.suggestion,
              }))
            }
          } catch (e) {
            console.error("Error parsing suggestions:", e)
            const errorMsg = "Failed to parse suggestion data"
            toast({
              title: "Parsing Error",
              description: errorMsg,
              variant: "destructive",
              duration: 5000,
            })
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
        const errorMsg = `Notes not available: ${error.message || "Unknown error"}`
        setNotesError(errorMsg)
        setReasoningComplete(true)
        setCurrentlyGeneratingDateKey(null)

        // Only show toast if not already shown by specific error handlers
        if (
          !error.message ||
          (!error.message.includes("Service") &&
            !error.message.includes("Connection") &&
            !error.message.includes("Health") &&
            !error.message.includes("Suggestion") &&
            !error.message.includes("Empty") &&
            !error.message.includes("Parsing"))
        ) {
          toast({
            title: "Error",
            description: errorMsg,
            variant: "destructive",
            duration: 5000,
          })
        }

        // Ensure we return a rejected promise
        return Promise.reject(error)
      }
    },
    [toast, droppedNotes],
  )

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

      // When saving a new file, we need to get a handle ID for it
      const handleId = createId() // Generate a new ID for this handle

      if (!currentFileHandle && vault) {
        // Store the handle in IndexedDB with the new ID
        await storeHandle(handleId, vaultId, handleId, targetHandle)

        setCurrentFileHandle(targetHandle)
        setCurrentFile(targetHandle.name)

        await refreshVault(vault.id)
      }

      // Save the current file info to localStorage for this vault
      if (isClient && vaultId) {
        try {
          const fileName = targetHandle.name
          localStorage.setItem(
            `morph:last-file:${vaultId}`,
            JSON.stringify({
              fileName,
              lastAccessed: new Date().toISOString(),
              handleId: handleId, // Use the newly created handleId
            }),
          )
        } catch (storageError) {
          console.error("Failed to save file info to localStorage:", storageError)
          // Non-critical, we can continue
        }
      }

      setHasUnsavedChanges(false)
    } catch {}
  }, [
    currentFileHandle,
    markdownContent,
    currentFile,
    vault,
    refreshVault,
    vaultId,
    isClient,
    storeHandle,
  ])

  const memoizedExtensions = useMemo(() => {
    const tabSize = new Compartment()

    const exts = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      frontmatter(),
      EditorView.lineWrapping,
      tabSize.of(EditorState.tabSize.of(settings.tabSize)),
      fileField.init(() => currentFile),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          // We only update the filename if it explicitly changes via the effect
          const newFilename = update.state.field(fileField)
          setCurrentFile(newFilename)
        }
      }),
      syntaxHighlighting(),
      search(),
      hyperLink,
    ]

    if (vimMode) exts.push(vim())
    return exts
  }, [settings, currentFile, vimMode])

  useEffect(() => {
    if (markdownContent) {
      updatePreview(markdownContent)
    }
  }, [markdownContent, updatePreview])

  // Add an effect to update preview specifically when a file is restored
  useEffect(() => {
    if (restoredFile?.content && !fileRestorationAttempted.current) {
      updatePreview(restoredFile.content)
    }
  }, [restoredFile, updatePreview])

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

    // Clear the last file info from localStorage
    if (isClient && vaultId) {
      try {
        localStorage.removeItem(`morph:last-file:${vaultId}`)
      } catch (storageError) {
        console.error("Failed to clear file info from localStorage:", storageError)
      }
    }
  }, [isClient, vaultId])

  // Create a function to toggle settings that we can pass to Rails
  const toggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => !prev)
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Special handling for settings shortcut - high priority
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        event.stopPropagation() // Stop event from bubbling up
        toggleSettings()
        return
      }

      // Other keyboard shortcuts
      if (event.key === settings.toggleNotes && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleNotes()
      } else if (event.key === settings.toggleEditMode && (event.metaKey || event.altKey)) {
        event.preventDefault()
        setIsEditMode((prev) => !prev)
      } else if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        handleSave()
      }
    },
    [handleSave, toggleNotes, settings, toggleSettings],
  )

  // Separate effect specifically for global keyboard shortcuts
  useEffect(() => {
    // Add event listener for keyboard shortcuts
    const handler = (e: KeyboardEvent) => handleKeyDown(e)
    window.addEventListener("keydown", handler, { capture: true }) // Use capture to get event before other handlers

    return () => window.removeEventListener("keydown", handler, { capture: true })
  }, [handleKeyDown])

  // Effect for vim mode and vim-specific keybindings
  useEffect(() => {
    Vim.defineEx("w", "w", handleSave)
    Vim.defineEx("wa", "w", handleSave)
    Vim.map(";", ":", "normal")
    Vim.map("jj", "<Esc>", "insert")
    Vim.map("jk", "<Esc>", "insert")
  }, [handleSave])

  const generateNewSuggestions = useCallback(
    async (steeringSettings: SteeringSettings) => {
      if (!currentFile || !vault || !markdownContent) return

      // Move current generation notes to history by adding them to notes array without the currentGenerationNotes flag
      if (currentGenerationNotes.length > 0) {
        // First ensure the current notes are in the main notes array (if they aren't already)
        setNotes((prev) => {
          // Filter out any notes that might already exist in the array
          const notesToAdd = currentGenerationNotes.filter(
            (note) => !prev.some((existingNote) => existingNote.id === note.id),
          )

          if (notesToAdd.length === 0) return prev

          // Add to notes and sort
          const combined = [...notesToAdd, ...prev]
          return combined.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
        })
      }

      // Clear current generation notes before starting new generation
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
        // Check if we're online before attempting to generate suggestions
        if (!isOnline) {
          throw new Error(
            "Cannot generate suggestions while offline. Please check your internet connection.",
          )
        }

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

        try {
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
                  tonality: steeringSettings.tonalityEnabled
                    ? steeringSettings.tonality
                    : undefined,
                  temperature: steeringSettings.temperature,
                  numSuggestions: steeringSettings.numSuggestions,
                },
              })

              // Insert notes into database
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
                  steering: note.steering || null,
                  embeddingStatus: "in_progress",
                  embeddingTaskId: null,
                })
              }

              // Add the newly created notes to our state
              setNotes((prev) => {
                const combined = [...newNotes, ...prev]
                return combined.sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                )
              })

              // Set current generation notes for UI
              setCurrentGenerationNotes(newNotes)

              // Submit each note for embedding individually and track task IDs for polling
              for (const note of newNotes) {
                const result = await submitNoteForEmbedding(db, note)

                // If successful and we have a task ID, add it for polling
                if (result) {
                  // Wait a small amount of time to ensure DB updates are complete
                  await new Promise((resolve) => setTimeout(resolve, 100))

                  // Then get the updated note with task ID
                  const updatedNote = await db.query.notes.findFirst({
                    where: eq(schema.notes.id, note.id),
                  })

                  if (updatedNote?.embeddingTaskId) {
                    addTask(updatedNote.embeddingTaskId)
                  }
                }
              }
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
        } catch (error: any) {
          const errorMessage =
            error.message || "Notes not available for this generation, try again later"
          setNotesError(errorMessage)
          setCurrentlyGeneratingDateKey(null)
          console.error("Failed to generate notes:", error)
        } finally {
          setIsNotesLoading(false)
        }
      } catch {}
    },
    [
      currentFile,
      fetchNewNotes,
      vault,
      streamingSuggestionColors,
      markdownContent,
      db,
      currentGenerationNotes,
      addTask,
      isOnline,
    ],
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
    // Remove from current generation notes
    setCurrentGenerationNotes((prev) => prev.filter((n) => n.id !== note.id))

    // Ensure the note is in the main notes array if it's not already
    setNotes((prev) => {
      // Check if note already exists in notes array
      if (prev.some((existingNote) => existingNote.id === note.id)) return prev

      // Add to notes and sort
      const combined = [...prev, note]
      return combined.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    })
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

      // Update the note to indicate it's no longer dropped
      const undropNote = {
        ...note,
        dropped: false,
        lastModified: new Date(),
        // Preserve embedding status
        embeddingStatus: note.embeddingStatus || "in_progress",
        embeddingTaskId: note.embeddingTaskId,
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
            // Preserve existing embedding values
            embeddingStatus: undropNote.embeddingStatus,
            embeddingTaskId: undropNote.embeddingTaskId,
          })
          .where(eq(schema.notes.id, noteId))

        // Add back to main notes collection if not already there
        setNotes((prevNotes) => {
          // If it exists, just update its dropped status
          if (prevNotes.some((n) => n.id === noteId)) {
            return prevNotes.map((n) =>
              n.id === noteId
                ? {
                    ...n,
                    dropped: false,
                    embeddingStatus: undropNote.embeddingStatus,
                    embeddingTaskId: undropNote.embeddingTaskId,
                  }
                : n,
            )
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

  // Update handleFileSelect to save the handle ID
  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !codeMirrorViewRef.current || !node.handle) return

      try {
        // Only do file I/O once
        const file = await node.handle!.getFile()
        const content = await file.text()
        const fileName = file.name

        // If the node doesn't have a handleId, create one and store it
        let handleId = node.handleId
        if (!handleId) {
          handleId = createId()
          // Store the handle for future use
          try {
            await storeHandle(handleId, vaultId, handleId, node.handle as FileSystemFileHandle)
          } catch (storeError) {
            console.error("Failed to store handle:", storeError)
            // Continue without storing - non-critical
          }
        } else {
          // Verify the existing handle is still valid
          try {
            const isValid = await verifyHandle(node.handle)
            if (!isValid) {
              await storeHandle(handleId, vaultId, handleId, node.handle as FileSystemFileHandle)
            }
          } catch (verifyError) {
            console.error("Failed to verify handle:", verifyError)
          }
        }

        // Save the current file info to localStorage for this vault
        if (isClient && vaultId) {
          try {
            localStorage.setItem(
              `morph:last-file:${vaultId}`,
              JSON.stringify({
                fileName,
                lastAccessed: new Date().toISOString(),
                handleId: handleId || node.id, // Use handleId if available, fall back to node.id
              }),
            )
          } catch (storageError) {
            console.error("Failed to save file info to localStorage:", storageError)
            // Non-critical, we can continue
          }
        }

        // Load file content first
        const success = loadFileContent(fileName, node.handle as FileSystemFileHandle, content)

        if (success) {
          // Reset all notes states in one batch
          setCurrentGenerationNotes([])
          setCurrentlyGeneratingDateKey(null)
          setNotesError(null)
          setNotes([])
          setDroppedNotes([])
          setReasoningHistory([])

          // Reset the processing flags to ensure new embeddings are processed
          embeddingProcessedRef.current = false
          essayEmbeddingProcessedRef.current = false

          // Load file metadata once
          await loadFileMetadataOnce(fileName)

          // Process essay embeddings if we're online
          if (isClient && isOnline) {
            try {
              // Find the file in the database to get its ID
              const dbFile = await db.query.files.findFirst({
                where: (files, { and, eq }) =>
                  and(eq(files.name, fileName), eq(files.vaultId, vault.id)),
              })

              if (dbFile) {
                // Check if this file already has embeddings
                const hasEmbeddings = await checkFileHasEmbeddings(db, dbFile.id)

                if (!hasEmbeddings) {
                  // Process essay embeddings asynchronously
                  const cleaned = md(content).content
                  processEssayEmbeddings.mutate({
                    addTask: addEssayTask,
                    currentContent: cleaned,
                    currentVaultId: vault.id,
                    currentFileId: dbFile.id,
                  })
                }

                // Process any existing notes for this file
                processEmbeddings.mutate({ addTask })
              }

              // Also process author recommendations
              if (!authorsProcessedRef.current && dbFile) {
                try {
                  // Get the file content
                  const fileContent = content // Use the content variable directly
                  const taskId = await submitContentForAuthors(db, dbFile.id, fileContent)
                  if (taskId) {
                    addAuthorTask(taskId, dbFile.id)
                    authorsProcessedRef.current = true
                  }
                } catch (error) {
                  console.error("[Editor] Error processing authors:", error)
                }
              }
            } catch (error) {
              console.error("Error processing file data:", error)
            }
          }
        } else {
          toast({
            title: "Error Loading File",
            description: `Could not load file ${node.name}. Please try again.`,
            variant: "destructive",
          })
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
    [
      vault,
      vaultId,
      isClient,
      isOnline,
      loadFileContent,
      loadFileMetadataOnce,
      toast,
      storeHandle,
      db,
      addEssayTask,
      addTask,
      processEmbeddings,
      processEssayEmbeddings,
      addAuthorTask,
    ],
  )

  // Add this ref to track if we've processed embeddings for the current file
  const embeddingProcessedRef = useRef(false)

  // Reset the embedding processed flag when the file changes
  useEffect(() => {
    embeddingProcessedRef.current = false
  }, [currentFile])

  // Add an effect to process all notes in the editor for embeddings
  useEffect(() => {
    if (!isClient || !isOnline || notes.length === 0) return

    // Check and process notes for embeddings after a short delay to avoid performance issues
    const timeoutId = setTimeout(async () => {
      try {
        // Only process if we haven't already for this file
        if (embeddingProcessedRef.current) return

        // Process up to 3 notes that don't have embeddings yet
        const notesToProcess = []
        let processedCount = 0

        // Create a stable copy of the notes array to avoid race conditions
        const currentNotes = [...notes]

        for (const note of currentNotes) {
          if (processedCount >= 3) break // Limit to 3 per batch

          // Only process notes that aren't already in progress or success
          if (
            note.embeddingStatus !== "success" &&
            note.embeddingStatus !== "in_progress" &&
            !note.dropped
          ) {
            const hasEmbedding = await checkNoteHasEmbedding(db, note.id)
            if (!hasEmbedding) {
              notesToProcess.push(note)
              processedCount++
            }
          }
        }

        // Process collected notes one by one
        for (const note of notesToProcess) {
          const result = await submitNoteForEmbedding(db, note)

          // If successful and we have a task ID, add it for polling
          if (result) {
            const updatedNote = await db.query.notes.findFirst({
              where: eq(schema.notes.id, note.id),
            })

            if (updatedNote?.embeddingTaskId) {
              addTask(updatedNote.embeddingTaskId)
            }
          }
        }

        // Mark as processed after we're done
        embeddingProcessedRef.current = true
      } catch (error) {
        console.error("[Embedding] Failed to check and process notes for embeddings:", error)
      }
    }, 2000) // 2 second delay

    return () => clearTimeout(timeoutId)
  }, [isClient, isOnline, currentFile, addTask, db, notes]) // Only depend on stable values, not notes array itself

  // Use the embedding status hook
  // This hooks has some side-effects, and must be called at the very last.
  const [embeddingStatus, setEmbeddingStatus] = useState<Note["embeddingStatus"]>(null)

  useEffect(() => {
    // If there are pending tasks (either notes or essays), show in-progress status
    if (pendingTaskIds.length > 0 || essayPendingTaskIds.length > 0) {
      setEmbeddingStatus("in_progress")
      return
    }

    // If no active tasks, but we need to see if notes have embeddings
    const allNotes = [...notes, ...currentGenerationNotes, ...droppedNotes].filter(Boolean)

    if (allNotes.length === 0) {
      setEmbeddingStatus(null)
      return
    }

    // Check if any notes still show in-progress (but might not have active tasks)
    const anyInProgress = allNotes.some((note) => note.embeddingStatus === "in_progress")
    if (anyInProgress) {
      setEmbeddingStatus("in_progress")
      return
    }

    // Check if all notes have successful embeddings
    const allSuccess = allNotes.every((note) => note.embeddingStatus === "success")
    if (allSuccess && allNotes.length > 0) {
      setEmbeddingStatus("success")
      return
    }

    // Check if any notes failed
    const anyFailed = allNotes.some(
      (note) => note.embeddingStatus === "failure" || note.embeddingStatus === "cancelled",
    )
    if (anyFailed) {
      setEmbeddingStatus("failure")
      return
    }

    // Default to null if we can't determine status
    setEmbeddingStatus(null)
  }, [notes, currentGenerationNotes, droppedNotes, pendingTaskIds, essayPendingTaskIds])

  // Add a ref to track if we've processed essay embeddings for the current file
  const essayEmbeddingProcessedRef = useRef(false)

  // Reset the essay embedding processed flag when the file changes
  useEffect(() => {
    essayEmbeddingProcessedRef.current = false
  }, [currentFile])

  // Add an effect to process file embeddings on mount and file change
  useEffect(() => {
    if (!isClient || !isOnline || currentFile === "Untitled") return

    // Process only if we haven't already for this file
    if (essayEmbeddingProcessedRef.current) return

    // Use a timeout to avoid processing immediately on mount
    const timeoutId = setTimeout(async () => {
      try {
        // Find the file in the database
        const dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) =>
            and(eq(files.name, currentFile), eq(files.vaultId, vault?.id || "")),
        })

        if (dbFile && markdownContent) {
          // Check if this file already has embeddings
          const hasEmbeddings = await checkFileHasEmbeddings(db, dbFile.id)

          if (!hasEmbeddings) {
            // Process essay embeddings asynchronously
            const content = md(markdownContent).content
            processEssayEmbeddings.mutate({
              addTask: addEssayTask,
              currentContent: content,
              currentVaultId: vault?.id || "",
              currentFileId: dbFile.id,
            })
          }

          // Mark as processed
          essayEmbeddingProcessedRef.current = true
        }
      } catch (error) {
        console.error("[EssayEmbedding] Failed to process file embeddings:", error)
      }
    }, 3000) // 3 second delay

    return () => clearTimeout(timeoutId)
  }, [
    isClient,
    isOnline,
    currentFile,
    vault,
    db,
    markdownContent,
    processEssayEmbeddings,
    addEssayTask,
  ])

  // Add an effect to update CodeMirror when vim mode changes
  useEffect(() => {
    // Only run if CodeMirror view is available
    if (codeMirrorViewRef.current) {
      // Create a new state that either includes or excludes vim() based on vimMode
      const newState = EditorState.create({
        doc: codeMirrorViewRef.current.state.doc,
        selection: codeMirrorViewRef.current.state.selection,
        extensions: [
          ...memoizedExtensions.filter((ext) => ext !== vim()),
          ...(vimMode ? [vim()] : []),
        ],
      })

      // Update the view with the new state
      codeMirrorViewRef.current.setState(newState)
    }
  }, [vimMode, memoizedExtensions])

  // Effect to check for vim mode change notification in localStorage
  useEffect(() => {
    // Only run on the client side
    if (!isClient) return

    // Check if there's a vim mode change notification in localStorage
    const vimModeChanged = localStorage.getItem("morph:vim-mode-changed") === "true"

    if (vimModeChanged) {
      // Show the notification
      setShowVimModeChangeNotification(true)

      // Clear the notification flag from localStorage
      localStorage.removeItem("morph:vim-mode-changed")

      // Set a timeout to dismiss the notification after a few seconds
      const timer = setTimeout(() => {
        setShowVimModeChangeNotification(false)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [isClient]) // Add isClient as a dependency

  // Add a ref to track if we've processed authors for the current file
  const authorsProcessedRef = useRef(false)

  // Reset the author processed flag when the file changes
  useEffect(() => {
    authorsProcessedRef.current = false
  }, [currentFile])

  // Add a ref to track the current file name to avoid unnecessary database queries
  // Add near other ref declarations (around line 150)
  const currentFileRef = useRef<string>("")

  useEffect(() => {
    // Only attempt to find the file ID if we have a valid vault and a non-default file name
    if (vault && currentFile && currentFile !== "Untitled") {
      // Skip if we've already processed this file
      if (currentFile === currentFileRef.current && currentFileId) {
        return
      }

      const caller = async () => {
        try {
          // Find the current file in the database
          const dbFile = await db.query.files.findFirst({
            where: (files, { and, eq }) =>
              and(eq(files.name, currentFile), eq(files.vaultId, vault.id)),
          })

          // Update the state with the file ID if found
          if (dbFile) {
            setCurrentFileId(dbFile.id)
            currentFileRef.current = currentFile
            console.log(`[ContextNotes] Found file ID ${dbFile.id} for ${currentFile}`)
          } else {
            console.log(`[ContextNotes] No file ID found for ${currentFile}`)
            setCurrentFileId(null)
            currentFileRef.current = ""
          }
        } catch (error) {
          console.error(`[ContextNotes] Error finding file ID for ${currentFile}:`, error)
          setCurrentFileId(null)
          currentFileRef.current = ""
        }
      }
      const timeout = setTimeout(caller, 1000)

      return () => clearTimeout(timeout)
    } else {
      // Reset the file ID if we don't have a valid file
      setCurrentFileId(null)
      currentFileRef.current = ""
    }
  }, [db, vault, currentFile, currentFileId])

  // Add the handler function (around line 500, with other handler functions)
  const handleVisibleContextNotesChange = useCallback((noteIds: string[]) => {
    setVisibleContextNoteIds(noteIds)
  }, [])

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
              setIsSettingsOpen={toggleSettings}
            />
            <SidebarInset className="flex flex-col h-screen flex-1 overflow-hidden">
              <Playspace vaultId={vaultId}>
                <NoteEmbeddingProcessor />
                <EssayEmbeddingProcessor />
                <AuthorProcessor />
                <AnimatePresence initial={false}>
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

                {/* Add vim mode change notification banner */}
                <AnimatePresence initial={false}>
                  {showVimModeChangeNotification && (
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="absolute top-2 left-1/2 transform -translate-x-1/2 z-50 bg-blue-400/70 border border-blue-300 text-blue-800 px-4 py-2 rounded-md shadow-md text-xs flex items-center space-x-2"
                    >
                      <span>
                        ⚠️ Turning{" "}
                        {localStorage.getItem("morph:vim-mode-value") === "true" ? "on" : "off"} Vim
                        mode requires a page refresh to take effect
                      </span>
                      <button
                        onClick={() => setShowVimModeChangeNotification(false)}
                        className="text-blue-800 hover:text-blue-900 hover:cursor-pointer"
                        aria-label="Dismiss notification"
                      >
                        <Cross2Icon className="w-3 h-3" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <EditorDropTarget handleNoteDropped={handleNoteDropped}>
                  <AnimatePresence initial={false} mode="sync">
                    {memoizedDroppedNotes.length > 0 && (
                      <DroppedNoteGroup
                        droppedNotes={memoizedDroppedNotes}
                        isStackExpanded={isStackExpanded}
                        onExpandStack={toggleStackExpand}
                        onDragBackToPanel={handleNoteDragBackToPanel}
                        className="before:mix-blend-multiply before:bg-noise-pattern"
                        visibleContextNoteIds={visibleContextNoteIds}
                      />
                    )}
                  </AnimatePresence>
                  <div className="flex flex-col items-center space-y-2 absolute bottom-2 right-4 z-20">
                    <VaultButton
                      className={cn(
                        isClient &&
                          (isNotesLoading || !isOnline) &&
                          "cursor-not-allowed opacity-50 hover:cursor-not-allowed",
                      )}
                      onClick={toggleNotes}
                      disabled={!isClient || isNotesLoading || !isOnline}
                      size="small"
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
                  <div className="absolute top-4 left-4 text-sm/7 z-10 flex flex-col items-start justify-self gap-2">
                    {hasUnsavedChanges && <DotIcon className="text-yellow-200" />}
                    {isClient && !isOnline && <GlobeIcon className="w-4 h-4 text-destructive" />}
                    {embeddingStatus && <EmbeddingStatus status={embeddingStatus} />}
                  </div>
                  {vault && currentFileId && memoizedDroppedNotes.length > 0 && !isNotesLoading && (
                    <ContextNotes
                      className={`${isEditMode ? "block" : "hidden"}`}
                      editorViewRef={codeMirrorViewRef}
                      readingModeRef={readingModeRef}
                      droppedNotes={memoizedDroppedNotes}
                      isEditMode={isEditMode}
                      fileId={currentFileId}
                      vaultId={vault.id}
                      onVisibleNotesChange={handleVisibleContextNotesChange}
                    />
                  )}
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
                          rectangularSelection: false,
                          indentOnInput: true,
                          syntaxHighlighting: true,
                          highlightActiveLine: true,
                          highlightSelectionMatches: true,
                        }}
                        indentWithTab={true}
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
                <AnimatePresence mode="wait" initial={false}>
                  {showNotes && (
                    <motion.div
                      key="notes-panel"
                      initial={{ width: "22rem", opacity: 1, overflow: "visible" }}
                      animate={{ width: "22rem", opacity: 1, overflow: "visible" }}
                      exit={{ width: 0, opacity: 0, overflow: "hidden" }}
                      transition={{ duration: 0 }}
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
          <SettingsPanel
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            setIsOpen={setIsSettingsOpen}
          />
        </SearchProvider>
      </SteeringProvider>
    </DndProvider>
  )
})
