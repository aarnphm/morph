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
import { CopyIcon, Cross2Icon } from "@radix-ui/react-icons"
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
import { useDebouncedCallback } from "use-debounce"

import { AuthorProcessor } from "@/components/author-processor"
import ContextNotes from "@/components/context-notes"
import { CustomDragLayer, EditorDropTarget } from "@/components/dnd"
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

import { usePGlite } from "@/context/db"
import { useEmbeddingTasks, useEssayEmbeddingTasks } from "@/context/embedding"
import { useRestoredFile } from "@/context/file-restoration"
import { LoadingProvider, useLoading } from "@/context/loading"
import { SearchProvider } from "@/context/search"
import { SteeringProvider, SteeringSettings } from "@/context/steering"
import { useVaultContext } from "@/context/vault"
import { verifyHandle } from "@/context/vault-reducer"

import useFsHandles from "@/hooks/use-fs-handles"
import usePersistedSettings from "@/hooks/use-persisted-settings"
import { useToast } from "@/hooks/use-toast"

import type { FileSystemTreeNode, Note, Vault } from "@/db/interfaces"
import * as schema from "@/db/schema"

// After all the imports but before the logNotesForFile function, add the synchronizer component:

/**
 * Component to sync editor loading state with the loading context
 */
interface LoadingContextSynchronizerProps {
  isNotesLoading: boolean
  isNotesRecentlyGenerated: boolean
}

function LoadingContextSynchronizer({
  isNotesLoading,
  isNotesRecentlyGenerated,
}: LoadingContextSynchronizerProps) {
  const { setNotesLoading, setNotesRecentlyGenerated } = useLoading()

  // Sync state to context
  useEffect(() => {
    setNotesLoading(isNotesLoading)
  }, [isNotesLoading, setNotesLoading])

  useEffect(() => {
    setNotesRecentlyGenerated(isNotesRecentlyGenerated)
  }, [isNotesRecentlyGenerated, setNotesRecentlyGenerated])

  return null
}

// Add this utility function after the imports but before the Editor component
/**
 * Utility to query and log all notes for a specific file
 */
async function logNotesForFile(
  db: any,
  fileId: string,
  vaultId: string,
  label: string = "Notes query",
) {
  if (process.env.NODE_ENV !== "development") return

  try {
    console.log(`[Notes Debug] ${label} - Querying all notes for file ${fileId}`)

    // Query all notes for this file
    const fileNotes = await db
      .select()
      .from(schema.notes)
      .where(and(eq(schema.notes.fileId, fileId), eq(schema.notes.vaultId, vaultId)))

    const regularNotes = fileNotes.filter((note: any) => !note.dropped)
    const droppedNotes = fileNotes.filter((note: any) => note.dropped)

    console.log(`[Notes Debug] ${label} - Found ${fileNotes.length} total notes:`)
    console.log(
      `[Notes Debug] ${label} - Regular notes: ${regularNotes.length}, Dropped notes: ${droppedNotes.length}`,
    )

    // Query all reasonings associated with these notes
    const reasoningIds = [
      ...new Set(fileNotes.map((note: any) => note.reasoningId).filter(Boolean)),
    ] as string[] // Explicitly type as string[]

    if (reasoningIds.length > 0) {
      console.log(`[Notes Debug] ${label} - Found ${reasoningIds.length} unique reasoning IDs`)

      const reasonings = await db
        .select()
        .from(schema.reasonings)
        .where(inArray(schema.reasonings.id, reasoningIds))

      console.log(
        `[Notes Debug] ${label} - Retrieved ${reasonings?.length || 0} reasonings from DB`,
      )

      // Log a summary of each reasoning and its notes
      for (const reasoning of reasonings) {
        const notesForReasoning = fileNotes.filter((n: any) => n.reasoningId === reasoning.id)
        console.log(
          `[Notes Debug] ${label} - Reasoning ${reasoning.id} has ${notesForReasoning.length} notes:`,
          notesForReasoning.map((n: any) => ({
            id: n.id,
            dropped: n.dropped,
            embeddingStatus: n.embeddingStatus,
          })),
        )
      }
    } else {
      console.log(`[Notes Debug] ${label} - No reasoning IDs found`)
    }

    return { fileNotes, regularNotes, droppedNotes }
  } catch (error) {
    console.error(`[Notes Debug] ${label} - Error querying notes:`, error)
    return { fileNotes: [], regularNotes: [], droppedNotes: [] }
  }
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

export interface AuthorRequest {
  essay: string
  authors?: string[]
  num_authors?: number
  temperature?: number
  max_tokens?: number
  search_backend?: "exa"
  num_search_results?: number
}

function saveLastFileInfo(vaultId: string | null, fileId: string, handleId: string) {
  if (!vaultId || fileId === null) return
  try {
    localStorage.setItem(
      `morph:last-file:${vaultId}`,
      JSON.stringify({
        lastAccessed: new Date().toISOString(),
        handleId,
        fileId,
      }),
    )
  } catch (storageError) {
    console.error("Failed to save file info to localStorage:", storageError)
  }
}

// Replace the wrapper component with a direct export of EditorComponent
export default memo(function Editor({ vaultId, vaults }: EditorProps) {
  const { theme } = useTheme()
  const { toast } = useToast()
  const { storeHandle } = useFsHandles()
  const { restoredFile, setRestoredFile } = useRestoredFile()
  const { settings } = usePersistedSettings()

  const { refreshVault, flattenedFileIds } = useVaultContext()
  const [isEditMode, setIsEditMode] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [previewNode, setPreviewNode] = useState<Root | null>(null)
  const [isNotesLoading, setIsNotesLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [currentFileHandle, setCurrentFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [scanAnimationComplete, setScanAnimationComplete] = useState(false)
  const [showEphemeralBanner, setShowEphemeralBanner] = useState(false)
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
  // Add a state for currentFileId that allows null values
  const [currentFileId, setCurrentFileId] = useState<string | null>(null)
  // Add a state for visible context note IDs (around line 150, with other state declarations)
  const [visibleContextNoteIds, setVisibleContextNoteIds] = useState<string[]>([])
  // Add state for author understanding indicator
  const [isAuthorProcessing, setIsAuthorProcessing] = useState(false)

  const client = usePGlite()
  const db = drizzle({ client, schema })

  const vault = vaults.find((v) => v.id === vaultId)

  // Add the process pending embeddings mutation
  const processEmbeddings = useProcessPendingEmbeddings(db)

  // Add the process pending embeddings mutation for essays
  const processEssayEmbeddings = useProcessPendingEssayEmbeddings(db)

  // create a ref for contents to batch updates
  const contentRef = useRef({ content: "" })

  // Create a ref for the keyboard handler to ensure stable identity
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})

  // Add this ref to track if we've processed embeddings for the current file
  const embeddingProcessedRef = useRef<string | null>(null)

  // Add a ref to track if we've processed essay embeddings for the current file
  const essayEmbeddingProcessedRef = useRef<string | null>(null)

  // Use a ref to store the timeout ID so we can access it in the cleanup function
  const embeddingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get the task actions for adding tasks
  const { addTask /*pendingTaskIds*/ } = useEmbeddingTasks()
  const { addTask: addEssayTask /*pendingTaskIds: essayPendingTaskIds*/ } = useEssayEmbeddingTasks()

  useEffect(() => {
    if (restoredFile && restoredFile!.fileId) setCurrentFileId(restoredFile!.fileId)
  }, [restoredFile])

  // Define updateContentRef function that updates content without logging
  const updateContentRef = useCallback(() => {
    contentRef.current = { content: markdownContent }
  }, [markdownContent])

  const toggleStackExpand = useCallback(() => {
    setIsStackExpanded((prev) => !prev)
  }, [])

  const updatePreview = useCallback(
    async (content: string) => {
      try {
        const tree = await mdToHtml({
          value: content,
          settings,
          vaultId,
          fileid: currentFileId,
          returnHast: true,
        })
        setPreviewNode(tree)
      } catch (error) {
        console.error(error)
      }
    },
    [currentFileId, settings, vaultId],
  )

  // Debounce the preview update function
  const debouncedUpdatePreview = useDebouncedCallback(updatePreview, 300) // 300ms debounce delay

  // Helper function to load file content and UI state
  const loadFileContent = useCallback(
    async (fileId: string, fileHandle: FileSystemFileHandle, content: string) => {
      if (!codeMirrorViewRef.current) return false

      try {
        codeMirrorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: codeMirrorViewRef.current.state.doc.length,
            insert: content,
          },
          effects: setFile.of(fileId),
        })

        // Update state
        setCurrentFileHandle(fileHandle)
        setCurrentFileId(fileId)
        setMarkdownContent(content)
        setHasUnsavedChanges(false)
        setIsEditMode(true)

        // Update preview
        debouncedUpdatePreview(content)

        // If this is not a new file, look up its ID in the database
        if (vault) {
          try {
            const dbFile = await db.query.files.findFirst({
              where: (files, { and, eq }) => and(eq(files.id, fileId), eq(files.vaultId, vaultId)),
            })

            if (dbFile) {
              // Only set current file id if we didn't already have it (important to avoid state conflicts)
              if (dbFile.id !== fileId) {
                setCurrentFileId(dbFile.id)
              }
            } else {
              // If file doesn't exist in the database yet, create it
              const extension = fileHandle.name.includes(".")
                ? fileHandle.name.split(".").pop() || ""
                : ""

              try {
                const newFile = await db
                  .insert(schema.files)
                  .values({
                    id: fileId,
                    name: fileHandle.name,
                    extension,
                    vaultId: vaultId,
                    lastModified: new Date(),
                    embeddingStatus: "in_progress",
                  })
                  .returning()

                if (newFile && newFile.length > 0) {
                  setCurrentFileId(newFile[0].id)
                }
              } catch (dbError) {
                console.error("Error creating file in database:", dbError)
                // Fall back to using provided id
                setCurrentFileId(fileId)
              }
            }
          } catch (error) {
            console.error("Error finding file in database:", error)
            // Fall back to using provided id
            setCurrentFileId(fileId)
          }
        } else {
          setCurrentFileId(fileId)
        }

        return true
      } catch (error) {
        console.error("Error loading file content:", error)
        return false
      }
    },
    [debouncedUpdatePreview, vaultId, vault, db],
  )

  // Helper function to load file metadata (notes, reasonings, etc.)
  const loadFileMetadata = useCallback(
    async (fileId: string) => {
      if (!vault || fileId === null) return

      try {
        console.log(`[Notes Debug] Starting to load metadata for file ${fileId}`)

        // Find the file in database
        const dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) => and(eq(files.id, fileId), eq(files.vaultId, vaultId)),
        })

        // If file doesn't exist in DB, create it
        if (!dbFile) {
          console.error(`File ${fileId} does not exists in db. Something has gone very wrong`)
          return
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
            .where(and(eq(schema.notes.fileId, dbFile.id), eq(schema.notes.vaultId, vaultId)))

          console.log(
            `[Notes Debug] Retrieved ${fileNotes?.length || 0} notes from DB for file ${fileId}`,
          )

          if (fileNotes && fileNotes.length > 0) {
            // Process notes and reasoning in parallel
            // Separate notes into regular and dropped notes
            const regularNotes = fileNotes.filter((note) => !note.dropped)
            const droppedNotesList = fileNotes.filter((note) => note.dropped)

            console.log(
              `[Notes Debug] Regular notes: ${regularNotes.length}, Dropped notes: ${droppedNotesList.length}`,
            )

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

            // Reset note states before updating to avoid merging with previous file's notes
            setCurrentGenerationNotes([])
            setCurrentlyGeneratingDateKey(null)
            setNotesError(null)

            let loadedReasoningHistory: ReasoningHistory[] = []

            // In parallel, fetch and process reasoning if needed
            const reasoningIds = [
              ...new Set(fileNotes.map((note) => note.reasoningId).filter(Boolean)),
            ] as string[] // Explicitly type as string[]
            if (reasoningIds.length > 0) {
              console.log(
                `[Notes Debug] Found ${reasoningIds.length} unique reasoning IDs, fetching reasoning`,
              )
              const reasonings = await db
                .select()
                .from(schema.reasonings)
                .where(inArray(schema.reasonings.id, reasoningIds))

              console.log(`[Notes Debug] Retrieved ${reasonings?.length || 0} reasonings from DB`)

              if (reasonings && reasonings.length > 0) {
                // Convert to ReasoningHistory format
                loadedReasoningHistory = reasonings.map((r) => ({
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
              }
            }

            // Update the state with fetched notes atomically to prevent flicker
            // Ensure we are using the correct variables here
            setNotes(uiReadyRegularNotes)
            setDroppedNotes(uiReadyDroppedNotes)
            setReasoningHistory(loadedReasoningHistory)

            console.log(`[Notes Debug] State updated after loading metadata:`, {
              notesCount: uiReadyRegularNotes.length,
              droppedNotesCount: uiReadyDroppedNotes.length,
              reasoningHistoryCount: loadedReasoningHistory.length,
            })
          } else {
            console.log(`[Notes Debug] No notes found for file ${fileId}, resetting state`)
            // Ensure state is reset even if no notes are found
            setNotes([])
            setDroppedNotes([])
            setReasoningHistory([])
            setCurrentGenerationNotes([])
            setCurrentlyGeneratingDateKey(null)
            setNotesError(null)
          }

          // After loading and setting up notes, perform a detailed query and log for verification
          await logNotesForFile(db, dbFile.id, vaultId, "After loadFileMetadata")

          // Reset embedding processing flags for the new file
          embeddingProcessedRef.current = null
          essayEmbeddingProcessedRef.current = null
        } catch (error) {
          console.error("Error fetching notes for file:", error)
          // Reset note states on error
          setCurrentGenerationNotes([])
          setCurrentlyGeneratingDateKey(null)
          setNotesError(null)
          setNotes([])
          setDroppedNotes([])
          setReasoningHistory([])
          throw error
        }
      } catch (dbError) {
        console.error("Error with database operations:", dbError)
        throw dbError
      }
    },
    [db, vault, vaultId],
  )

  const toggleNotes = useCallback(async () => {
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
        console.log(
          `[Notes Debug] Syncing ${currentGenerationNotes.length} current generation notes to DB on panel close`,
        )

        // Process the notes synchronously, rather than in state updater
        // Filter out any duplicates that might already exist
        const notesToAdd = currentGenerationNotes.filter(
          (note) => !notes.some((existingNote) => existingNote.id === note.id),
        )

        if (notesToAdd.length > 0) {
          console.log(`[Notes Debug] Adding ${notesToAdd.length} new notes to state`)
          // Add to notes and sort by creation date
          const combined = [...notesToAdd, ...notes]
          const sorted = combined.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          setNotes(sorted)
        }

        // Save notes to database if the file isn't null and we have a vault
        if (currentFileId !== null && vault) {
          // We use a self-executing async function to avoid making the whole callback async
          try {
            console.log(`[Notes Debug] Saving notes to DB for file ${currentFileId}`)
            // First, find the file in database
            const dbFile = await db.query.files.findFirst({
              where: (files, { and, eq }) =>
                and(eq(files.id, currentFileId), eq(files.vaultId, vaultId)),
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

                console.log(
                  `[Notes Debug] Creating new reasoning in DB with ID ${currentReasoningId} and ${noteIds.length} note IDs`,
                )

                // Insert reasoning with properly typed steering (can be null)
                await db.insert(schema.reasonings).values({
                  id: currentReasoningId,
                  fileId: dbFile.id,
                  vaultId: vaultId,
                  content: currentReasoning.content,
                  noteIds: noteIds,
                  createdAt: currentReasoning.timestamp,
                  accessedAt: new Date(),
                  duration: currentReasoning.reasoningElapsedTime,
                  steering: currentGenerationNotes[0]?.steering || null,
                })
              } else {
                console.log(
                  `[Notes Debug] Reasoning ${currentReasoningId} already exists in DB, skipping creation`,
                )
              }
            }

            // For each note, ensure it's saved to database if not already
            for (const note of currentGenerationNotes) {
              // Check if note exists in database
              const existingNote = await db.query.notes.findFirst({
                where: eq(schema.notes.id, note.id),
              })

              if (!existingNote) {
                console.log(`[Notes Debug] Saving new note to DB: ${note.id}`)

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
              } else {
                console.log(`[Notes Debug] Note ${note.id} already exists in DB, skipping creation`)
              }
            }

            // Process notes for embedding one by one and set up polling
            for (const note of currentGenerationNotes) {
              const hasEmbedding = await checkNoteHasEmbedding(db, note.id)
              if (!hasEmbedding) {
                console.log(`[Notes Debug] Submitting note ${note.id} for embedding`)
                const result = await submitNoteForEmbedding(db, note)

                // If successful and we have a task ID, add it for polling
                if (result) {
                  const updatedNote = await db.query.notes.findFirst({
                    where: eq(schema.notes.id, note.id),
                  })

                  if (updatedNote?.embeddingTaskId) {
                    addTask(updatedNote.embeddingTaskId)
                    console.log(
                      `[Notes Debug] Added embedding task ${updatedNote.embeddingTaskId} for note ${note.id}`,
                    )
                  }
                }
              } else {
                console.log(
                  `[Notes Debug] Note ${note.id} already has embedding, skipping submission`,
                )
              }
            }
          } catch (error) {
            console.error("Failed to sync notes to database:", error)
          }
        }

        // Reset current generation state to prevent duplication when reopening
        setCurrentGenerationNotes([])
        setCurrentlyGeneratingDateKey(null)
      }
    } else {
      // When opening the notes panel, check for notes that need embeddings
      // but only process once per file to avoid excessive processing
      if (notes.length > 0 && !embeddingProcessedRef.current) {
        console.log(`[Notes Debug] Processing embeddings for ${notes.length} notes`)
        processEmbeddings.mutate({ addTask })
        embeddingProcessedRef.current = `${vault?.id || ""}:${currentFileId}`
      }
    }

    // Update state after all synchronous operations
    setShowNotes(shouldShowNotes)
  }, [
    vaultId,
    vault,
    currentGenerationNotes,
    currentlyGeneratingDateKey,
    currentFileId,
    db,
    currentReasoningId,
    reasoningHistory,
    processEmbeddings,
    addTask,
    notes,
    showNotes,
  ])

  const handleNoteDropped = useCallback(
    async (note: Note) => {
      if (currentFileId === null) return
      console.log(`[Notes Debug] Handling note drop for note ${note.id}`)

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
            and(eq(files.id, currentFileId!), eq(files.vaultId, vault?.id || "")),
        })

        if (!dbFile) {
          console.error("Failed to find file in database when dropping note")
          return
        }

        console.log(`[Notes Debug] Updating note ${note.id} in DB to mark as dropped`)

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

        console.log(`[Notes Debug] Successfully updated note ${note.id} as dropped in DB`)

        // After updating the note's dropped status, check if it needs embedding
        // If it doesn't already have an embedding, submit it
        const hasEmbedding = await checkNoteHasEmbedding(db, noteWithColor.id)
        if (!hasEmbedding) {
          console.log(`[Notes Debug] Note ${note.id} needs embedding, submitting...`)

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
                console.log(
                  `[Notes Debug] Added embedding task ${updatedNote.embeddingTaskId} for note ${note.id}`,
                )

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
              console.log(`[Notes Debug] Failed to submit note ${note.id} for embedding`)

              // Update dropped notes to show failure
              setDroppedNotes((prev) =>
                prev.map((n) =>
                  n.id === noteWithColor.id ? { ...n, embeddingStatus: "failure" } : n,
                ),
              )
            }
          }
        } else {
          console.log(`[Notes Debug] Note ${note.id} already has embedding, marking as success`)

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
    [db, currentFileId, vault, addTask],
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
            tonality: steeringOptions?.tonality,
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
      let fileId = currentFileId
      const handleId = createId() // Always generate a new handle ID
      let isNewFile = false

      // If we're working with the default file or don't have a handle, we need to save as a new file
      if (!targetHandle || fileId === null) {
        isNewFile = true
        // For new files, create a new unique file ID if we're using null
        if (fileId === null) {
          fileId = createId()
        }

        // Show the save file picker
        targetHandle = await window.showSaveFilePicker({
          id: vaultId,
          suggestedName: `morph-${fileId}.md`,
          types: [
            {
              description: "Markdown Files",
              accept: { "text/markdown": [".md"] },
            },
          ],
        })
      }

      // Write the file content
      const writable = await targetHandle.createWritable()
      await writable.write(markdownContent)
      await writable.close()

      const file = await targetHandle.getFile()

      // If this is a new file and we have a vault, create a db entry
      if (isNewFile && vault) {
        // Extract the filename and extension
        const filename = targetHandle.name
        const extension = filename.includes(".") ? filename.split(".").pop() || "" : ""

        try {
          // Create a new file entry in the database
          const newFile = await db
            .insert(schema.files)
            .values({
              id: fileId,
              name: filename,
              extension,
              vaultId: vaultId,
              lastModified: new Date(),
              embeddingStatus: "in_progress",
            })
            .returning()

          if (newFile && newFile.length > 0) {
            // Use the database-generated ID if available
            const dbFileId = newFile[0].id

            // Store the handle in IndexedDB with the new ID
            await storeHandle(handleId, vaultId, dbFileId, targetHandle)

            // Update component state with the new file information
            setCurrentFileId(dbFileId)
            setCurrentFileHandle(targetHandle)

            // Refresh the vault to show the new file
            await refreshVault(vaultId)

            // Update fileId to use the DB one for localStorage
            fileId = dbFileId
          }
        } catch (dbError) {
          console.error("Error creating file in database:", dbError)
          // If database save fails, still update local state
          setCurrentFileId(fileId)
          setCurrentFileHandle(targetHandle)

          // Store the handle even if DB fails
          await storeHandle(handleId, vaultId, fileId, targetHandle)
        }
      } else if (currentFileId !== null) {
        // Update last modified time for existing files
        try {
          await db
            .update(schema.files)
            .set({ lastModified: new Date() })
            .where(
              and(eq(schema.files.id, currentFileId), eq(schema.files.vaultId, vault?.id || "")),
            )
        } catch (error) {
          console.error("Error updating file last modified time:", error)
        }
      }

      // Save the current file info to localStorage
      saveLastFileInfo(vaultId, fileId, handleId)

      // Update the restored file context
      setRestoredFile({
        file,
        fileHandle: targetHandle,
        fileId,
        content: markdownContent,
        handleId,
      })

      // Update the content reference only after successful save
      updateContentRef()

      // Reset unsaved changes flag
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error("Error saving file:", error)
    }
  }, [
    setRestoredFile,
    currentFileHandle,
    markdownContent,
    vault,
    refreshVault,
    vaultId,
    storeHandle,
    currentFileId,
    db,
    updateContentRef,
  ])

  const baseExtensions = useMemo(() => {
    const tabSize = new Compartment()

    return [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      frontmatter(),
      EditorView.lineWrapping,
      tabSize.of(EditorState.tabSize.of(settings.tabSize)),
      fileField.init(() => currentFileId),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          // We only update the filename if it explicitly changes via the effect
          const newFileId = update.state.field(fileField)
          setCurrentFileId(newFileId)
        }
      }),
      syntaxHighlighting(),
      search(),
      hyperLink,
    ]
  }, [settings.tabSize, currentFileId])

  // Only compute extensions that will be used in the editor
  const memoizedExtensions = useMemo(() => {
    return vimMode ? [...baseExtensions, vim()] : baseExtensions
  }, [baseExtensions, vimMode])

  // Memoize the basicSetup object
  const memoizedBasicSetup = useMemo(
    () => ({
      rectangularSelection: false,
      indentOnInput: true,
      syntaxHighlighting: true,
      highlightActiveLine: true,
      highlightSelectionMatches: true,
    }),
    [],
  )

  const onNewFile = useCallback(() => {
    setCurrentFileHandle(null)
    setMarkdownContent("") // Clear content for new file
    setIsEditMode(true)
    setPreviewNode(null) // Clear preview

    // Reset all note states for new file
    setNotes([])
    setDroppedNotes([])
    setCurrentGenerationNotes([])
    setCurrentlyGeneratingDateKey(null)
    setNotesError(null)
    setReasoningHistory([])

    // Reset embedding processing flags
    embeddingProcessedRef.current = null
    essayEmbeddingProcessedRef.current = null

    setHasUnsavedChanges(false) // Reset unsaved changes
    // Set currentFileId to null for new file
    setCurrentFileId(null)

    // Clear the last file info from localStorage
    if (vaultId) {
      try {
        localStorage.removeItem(`morph:last-file:${vaultId}`)
      } catch (storageError) {
        console.error("Failed to clear file info from localStorage:", storageError)
      }
    }
  }, [vaultId])

  // Create a function to toggle settings that we can pass to Rails
  const toggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => !prev)
  }, [])

  const generateNewSuggestions = useCallback(
    async (steeringSettings: SteeringSettings) => {
      if (!vault || !markdownContent) return

      console.log(`[Notes Debug] Starting to generate new suggestions with settings:`, {
        numSuggestions: steeringSettings.numSuggestions,
        hasAuthors: !!steeringSettings.authors,
        temperature: steeringSettings.temperature,
        hasTonality: steeringSettings.tonalityEnabled,
      })

      // Move current generation notes to history by adding them to notes array without the currentGenerationNotes flag
      if (currentGenerationNotes.length > 0) {
        console.log(
          `[Notes Debug] Moving ${currentGenerationNotes.length} current generation notes to history`,
        )
        // First ensure the current notes are in the main notes array (if they aren't already)
        setNotes((prev) => {
          // Filter out any notes that might already exist in the array
          const notesToAdd = currentGenerationNotes.filter(
            (note) => !prev.some((existingNote) => existingNote.id === note.id),
          )

          if (notesToAdd.length === 0) return prev

          console.log(`[Notes Debug] Adding ${notesToAdd.length} notes to main notes array`)
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
      // Update loading state via setState
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
            and(eq(files.id, currentFileId!), eq(files.vaultId, vaultId)),
        })

        console.log(`[Notes Debug] Found file in DB: ${dbFile?.id || "not found"}`)

        if (!dbFile) {
          console.log(
            `[Notes Debug] File not found in DB, creating new file entry for ${currentFileHandle?.name}`,
          )
          // Insert file into database
          await db.insert(schema.files).values({
            name: currentFileHandle!.name,
            extension: "md",
            vaultId: vaultId,
            lastModified: new Date(),
            embeddingStatus: "in_progress",
          })

          // Re-fetch the file to get its ID
          dbFile = await db.query.files.findFirst({
            where: (files, { and, eq }) =>
              and(eq(files.id, currentFileId!), eq(files.vaultId, vaultId)),
          })

          if (!dbFile) {
            throw new Error("Failed to create file in database")
          }
          console.log(`[Notes Debug] Created new file in DB with ID: ${dbFile.id}`)
        }

        try {
          // Now that we have the file, generate the suggestions
          console.log(`[Notes Debug] Fetching new notes from API`)
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

          console.log(
            `[Notes Debug] Received ${generatedNotes.length} generated notes with reasoning ID: ${reasoningId}`,
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
              vaultId: vaultId,
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

          // Prepare the reasoning record to be saved
          const reasoningRecordToSave = {
            id: reasoningId,
            fileId: dbFile!.id,
            vaultId: vaultId,
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
          }

          // Only save if the file is not null and we have notes to save
          if (currentFileId !== null && vault && newNotes.length > 0) {
            try {
              console.log(`[Notes Debug] Saving reasoning with ID ${reasoningId} to DB`)
              // Use Promise.all to save reasoning and notes concurrently
              await Promise.all([
                // Ensure reasoningRecordToSave matches the schema expectations
                db.insert(schema.reasonings).values(reasoningRecordToSave),
                ...newNotes.map((note) => {
                  console.log(`[Notes Debug] Saving note ${note.id} to DB`)
                  return db.insert(schema.notes).values({
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
                }),
              ])

              console.log(`[Notes Debug] Saving ${newNotes.length} new notes to DB`)
              console.log(`[Notes Debug] Notes and reasoning saved successfully.`)

              // **Update UI state AFTER successful DB operations**
              // Fix: Ensure the object matches ReasoningHistory type
              setReasoningHistory((prev) => [
                ...prev,
                {
                  ...reasoningRecordToSave,
                  timestamp: now,
                  reasoningElapsedTime: reasoningRecordToSave.duration, // Use duration for elapsedTime
                },
              ])

              setNotes((prev) => {
                const combined = [...newNotes, ...prev]
                return combined.sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                )
              })

              // Set current generation notes for UI
              setCurrentGenerationNotes(newNotes)

              console.log(`[Notes Debug] Processing embeddings for ${newNotes.length} new notes`)
              // Submit each note for embedding individually and track task IDs for polling
              for (const note of newNotes) {
                console.log(`[Notes Debug] Submitting note ${note.id} for embedding`)
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
                    console.log(
                      `[Notes Debug] Added embedding task ${updatedNote.embeddingTaskId} for note ${note.id}`,
                    )
                  } else {
                    console.log(
                      `[Notes Debug] Note ${note.id} has no embedding task ID after submission`,
                    )
                  }
                } else {
                  console.log(`[Notes Debug] Failed to submit note ${note.id} for embedding`)
                }
              }

              // Log the notes after saving to verify they were saved correctly
              await logNotesForFile(db, dbFile!.id, vaultId, "After generating new suggestions")
            } catch (dbError) {
              console.error("Failed to save notes to database:", dbError)
              // Still show notes in UI even if DB fails
              console.log(`[Notes Debug] Showing notes in UI despite DB save failure`)
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
            console.log(`[Notes Debug] Displaying ephemeral notes for unsaved file`)
            setShowEphemeralBanner(true)
            setTimeout(() => setShowEphemeralBanner(false), 7000)
            // Update UI immediately for ephemeral notes
            setReasoningHistory((prev) => [
              ...prev,
              {
                ...reasoningRecordToSave,
                timestamp: now,
                reasoningElapsedTime: reasoningRecordToSave.duration, // Use duration for elapsedTime
              },
            ])
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
          console.error(`[Notes Debug] Failed to generate notes: ${errorMessage}`, error)
        } finally {
          setIsNotesLoading(false)
        }
      } catch (error) {
        console.error("[Notes Debug] Error in generateNewSuggestions:", error)
      }
    },
    [
      vaultId,
      currentFileId,
      currentFileHandle,
      fetchNewNotes,
      vault,
      streamingSuggestionColors,
      markdownContent,
      db,
      currentGenerationNotes,
      addTask,
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
            and(eq(files.id, currentFileId!), eq(files.vaultId, vault?.id || "")),
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
    [droppedNotes, db, vault, currentFileId, setNotes],
  )

  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !codeMirrorViewRef.current || !node.handle) return

      try {
        console.log(`[Notes Debug] Selecting file: ${node.name} (${node.id})`)

        // Reset all note states when selecting a new file
        // This prevents stale notes from appearing temporarily
        setNotes([])
        setDroppedNotes([])
        setCurrentGenerationNotes([])
        setCurrentlyGeneratingDateKey(null)
        setNotesError(null)
        setReasoningHistory([])

        // Reset embedding processing flags for new file selection
        embeddingProcessedRef.current = null
        essayEmbeddingProcessedRef.current = null

        const file = await node.handle!.getFile()
        const content = await file.text()

        // If the node doesn't have a handleId, create one and store it
        let handleId = node.handleId
        if (!handleId) {
          handleId = createId()
          // Store the handle for future use
          try {
            await storeHandle(handleId, vaultId, node.id, node.handle as FileSystemFileHandle)
          } catch (storeError) {
            console.error("Failed to store handle:", storeError)
            // Continue without storing - non-critical
          }
        } else {
          // Verify the existing handle is still valid
          try {
            const isValid = await verifyHandle(node.handle)
            if (!isValid) {
              await storeHandle(handleId, vaultId, node.id, node.handle as FileSystemFileHandle)
            }
          } catch (verifyError) {
            console.error("Failed to verify handle:", verifyError)
          }
        }

        // Set the fileId early so it can be used immediately
        const targetFileId = node.id
        setCurrentFileId(targetFileId)

        // Load file content - this should now find the correct file ID
        const success = await loadFileContent(
          targetFileId,
          node.handle as FileSystemFileHandle,
          content,
        )

        if (success) {
          console.log(
            `[Notes Debug] Successfully loaded content for file ${targetFileId}, now loading metadata`,
          )

          // Load file metadata using the now properly set currentFileId
          await loadFileMetadata(targetFileId)

          // Log notes for the file after metadata is loaded
          if (vault) {
            await logNotesForFile(db, targetFileId, vaultId, "After file selection")
          }

          console.log(
            `[Notes Debug] Saving file info with ID: ${targetFileId}, handleId: ${handleId || node.id}`,
          )
          // Save the last accessed file info with the correct ID
          saveLastFileInfo(vaultId, targetFileId, handleId || node.id)

          // Update restored file in context for future restorations
          setRestoredFile({
            file,
            fileHandle: node.handle as FileSystemFileHandle,
            fileId: targetFileId,
            content,
            handleId: handleId || node.id,
          })

          // Process essay embeddings if needed
          if (targetFileId !== null) {
            try {
              // Skip if already being processed
              if (essayEmbeddingProcessedRef.current === `${vaultId}:${targetFileId}`) {
                console.log(
                  `[Notes Debug] Skipping duplicate essay embedding processing for ${node.name}`,
                )
                return
              }

              // Mark as processing immediately using ID
              essayEmbeddingProcessedRef.current = `${vaultId}:${targetFileId}`

              // Check if this file already has embeddings
              const hasEmbeddings = await checkFileHasEmbeddings(db, targetFileId)

              if (!hasEmbeddings) {
                console.log(`[Notes Debug] Processing essay embeddings for ${node.name}`)
                const cleaned = md(content).content
                processEssayEmbeddings.mutate({
                  addTask: addEssayTask,
                  currentContent: cleaned,
                  currentVaultId: vaultId,
                  currentFileId: targetFileId,
                })
              } else {
                console.log(
                  `[Notes Debug] File ${node.name} already has embeddings, skipping processing`,
                )
              }

              // Process any existing notes for this file only once
              if (!embeddingProcessedRef.current) {
                console.log(`[Notes Debug] Processing note embeddings for ${node.name}`)
                embeddingProcessedRef.current = `${vaultId}:${targetFileId}`
                processEmbeddings.mutate({ addTask })
              }
            } catch (error) {
              console.error("Error processing file data:", error)
              // Reset flags on error to allow retrying
              essayEmbeddingProcessedRef.current = null
              embeddingProcessedRef.current = null
            }
          }
        } else {
          console.log(`[Notes Debug] Failed to load content for file ${targetFileId}`)
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
      loadFileContent,
      loadFileMetadata,
      toast,
      storeHandle,
      db,
      addEssayTask,
      addTask,
      processEmbeddings,
      processEssayEmbeddings,
      setRestoredFile,
    ],
  )

  // Add the handler function (around line 500, with other handler functions)
  const handleVisibleContextNotesChange = useCallback((noteIds: string[]) => {
    setVisibleContextNoteIds(noteIds)
  }, [])

  const onContentChange = useCallback(
    async (value: string) => {
      // Only update hasUnsavedChanges if it's not already set
      // This prevents constant re-renders
      if (!hasUnsavedChanges && value !== contentRef.current.content) {
        setHasUnsavedChanges(true)
      }

      // Always update the current content
      setMarkdownContent(value)

      // Update preview with the new content using the debounced function
      debouncedUpdatePreview(value)
    },
    [debouncedUpdatePreview, hasUnsavedChanges, contentRef], // Use debounced function here
  )

  // Effect to use preloaded file from context if available
  useEffect(() => {
    if (!restoredFile || fileRestorationAttempted.current) return

    // Mark file as restored so we don't try again
    fileRestorationAttempted.current = true

    // Update local state even before CodeMirror is ready
    // These happen before async operations and are safe
    setMarkdownContent(restoredFile.content)
    setCurrentFileId(restoredFile.fileId)
    setCurrentFileHandle(restoredFile.fileHandle)
    setHasUnsavedChanges(false)

    // Update preview immediately with the restored content
    debouncedUpdatePreview(restoredFile.content)

    // Create flags to track processing status
    let embeddingProcessingStarted = false

    // If CodeMirror is ready, also update it
    if (codeMirrorViewRef.current) {
      // This will also set currentFileId via the loadFileContent function
      loadFileContent(restoredFile.fileId, restoredFile.fileHandle, restoredFile.content).then(
        async (success) => {
          // Load file metadata if content loading was successful and we have a valid file ID
          // Use the currentFileId set by loadFileContent
          if (success && vault && currentFileId) {
            try {
              // Reset note states *before* loading new metadata
              console.log(
                `[Notes Debug] Resetting notes state before loading metadata for ${currentFileId}`,
              )
              setNotes([])
              setDroppedNotes([])
              setCurrentGenerationNotes([])
              setCurrentlyGeneratingDateKey(null)
              setNotesError(null)
              setReasoningHistory([])
              // Reset embedding processing flags
              embeddingProcessedRef.current = null
              essayEmbeddingProcessedRef.current = null

              console.log(`[Notes Debug] Loading metadata for restored file: ${currentFileId}`)
              await loadFileMetadata(currentFileId)
              console.log(`[Notes Debug] Metadata loaded for ${currentFileId}`)

              // Log notes after metadata loading attempt
              await logNotesForFile(db, currentFileId, vaultId, "After restoring file")

              // Process essay embeddings for restored file (only if online)
              // Use a small timeout to let the file load completely first
              embeddingTimeoutRef.current = setTimeout(async () => {
                try {
                  // Skip if processing has already started or if file is already processed
                  if (
                    embeddingProcessingStarted ||
                    essayEmbeddingProcessedRef.current === `${vaultId}:${currentFileId}`
                  ) {
                    console.log(
                      `[Debug] Skipping duplicate essay embedding processing for restored file ${currentFileId}`,
                    )
                    return
                  }

                  // Mark as processing immediately
                  embeddingProcessingStarted = true
                  essayEmbeddingProcessedRef.current = `${vaultId}:${currentFileId}`

                  // Check if this file already has embeddings - use the current file ID
                  const hasEmbeddings = await checkFileHasEmbeddings(db, currentFileId!)

                  if (!hasEmbeddings) {
                    console.log(`[Debug] Processing embeddings for restored file ${currentFileId}`)
                    // Process essay embeddings asynchronously using the md content function
                    const content = md(restoredFile.content).content
                    processEssayEmbeddings.mutate({
                      addTask: addEssayTask,
                      currentContent: content,
                      currentVaultId: vaultId,
                      currentFileId: currentFileId!,
                    })
                  } else {
                    console.log(`[Debug] Restored file ${currentFileId} already has embeddings`)
                  }

                  // Process any existing notes for this file (only once)
                  if (!embeddingProcessedRef.current) {
                    embeddingProcessedRef.current = `${vaultId}:${currentFileId}`
                    processEmbeddings.mutate({ addTask })
                  }
                } catch (error) {
                  console.error(`Error processing file data for ${currentFileId}:`, error)
                  // Reset flags on error to allow retrying
                  essayEmbeddingProcessedRef.current = null
                  embeddingProcessedRef.current = null
                }
              }, 1000) // 1 second delay to ensure DB operations are ready
            } catch (error) {
              console.error(`Error loading file metadata for ${currentFileId}:`, error)
              // If metadata loading fails, ensure the notes state remains cleared
              setNotes([])
              setDroppedNotes([])
              setCurrentGenerationNotes([])
              setCurrentlyGeneratingDateKey(null)
              setNotesError(
                `Failed to load notes: ${error instanceof Error ? error.message : "Unknown error"}`,
              )
              setReasoningHistory([])
            }
          }
        },
      )
    }

    // Cleanup timeout on unmount or if dependencies change
    return () => {
      if (embeddingTimeoutRef.current) {
        clearTimeout(embeddingTimeoutRef.current)
      }
    }
  }, [
    vaultId,
    restoredFile,
    loadFileContent,
    loadFileMetadata,
    vault,
    db,
    processEmbeddings,
    processEssayEmbeddings,
    addTask,
    addEssayTask,
    debouncedUpdatePreview,
    currentFileId,
  ])

  // Update the ref when dependencies change, but don't recreate the event listener
  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      // Special handling for settings shortcut - high priority
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        event.stopPropagation() // Stop event from bubbling up
        toggleSettings()
        return
      }

      // Save shortcut should have priority
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        event.stopPropagation()
        handleSave()
        return
      }

      // Other keyboard shortcuts
      if (event.key === settings.toggleNotes && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleNotes()
      } else if (event.key === settings.toggleEditMode && (event.metaKey || event.altKey)) {
        event.preventDefault()
        setIsEditMode((prev) => !prev)
      }
    }
  }, [handleSave, toggleNotes, settings.toggleNotes, settings.toggleEditMode, toggleSettings])

  // Effect to update vimMode state when settings change
  useEffect(() => {
    // Only update vimMode if it differs from settings.vimMode
    if (settings.vimMode !== vimMode) {
      console.log("Updating vim mode from settings")
      setVimMode(settings.vimMode ?? false)
    }
  }, [settings.vimMode, vimMode])

  // Register vim commands separately to avoid type errors
  useEffect(() => {
    if (vimMode) {
      // Register our vim commands for saving
      Vim.defineEx("w", "w", () => {
        handleSave()
      })
      Vim.defineEx("wa", "wa", () => {
        handleSave()
      })
      // Register other vim commands
      Vim.map(";", ":", "normal")
      Vim.map("jj", "<Esc>", "insert")
      Vim.map("jk", "<Esc>", "insert")
    }
    return () => {
      // Clean up vim commands when dependencies change
      Vim.unmap(";", "normal")
      Vim.unmap("jj", "insert")
      Vim.unmap("jk", "insert")
    }
  }, [vimMode, handleSave])

  // Stable keyboard handler event listener setup
  useEffect(() => {
    // Create a stable handler that uses the current ref value
    const stableHandler = (e: KeyboardEvent) => {
      keyHandlerRef.current?.(e)
    }

    // Add event listener only once
    console.log("Registering keyboard handler")
    window.addEventListener("keydown", stableHandler, { capture: true })

    // Clean up on unmount only
    return () => {
      console.log("Removing keyboard handler")
      window.removeEventListener("keydown", stableHandler, { capture: true })
    }
  }, []) // Empty dependency array = run once on mount

  // Add an effect to update CodeMirror when vim mode changes
  useEffect(() => {
    // Only run if CodeMirror view is available
    if (codeMirrorViewRef.current) {
      console.log("Updating CodeMirror vim mode")

      // Instead of trying to query facets directly, just create a new state when mode changes
      const newState = EditorState.create({
        doc: codeMirrorViewRef.current.state.doc,
        selection: codeMirrorViewRef.current.state.selection,
        extensions: vimMode ? [...baseExtensions, vim()] : baseExtensions,
      })

      // Update the view with the new state
      codeMirrorViewRef.current.setState(newState)
    }
  }, [vimMode, baseExtensions]) // Only depend on vimMode and baseExtensions

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
              <section className="flex flex-1 overflow-hidden m-4 border rounded-[8px]">
                <NoteEmbeddingProcessor db={db} />
                <EssayEmbeddingProcessor db={db} />
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

                {/* Author processing indicator */}
                <AnimatePresence initial={false}>
                  {isAuthorProcessing && (
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="absolute top-2 right-2 z-50 bg-blue-100 border border-blue-300 text-blue-800 px-4 py-2 rounded-md shadow-md text-xs flex items-center space-x-2"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4 text-blue-600"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Building document context for better suggestions...
                      </span>
                      <button
                        onClick={() => setIsAuthorProcessing(false)}
                        className="text-blue-600 hover:text-blue-800 hover:cursor-pointer"
                        aria-label="Dismiss notification"
                      >
                        <Cross2Icon className="w-3 h-3" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <EditorDropTarget handleNoteDropped={handleNoteDropped}>
                  <DroppedNoteGroup
                    droppedNotes={memoizedDroppedNotes}
                    isStackExpanded={isStackExpanded}
                    onExpandStack={toggleStackExpand}
                    onDragBackToPanel={handleNoteDragBackToPanel}
                    className="before:mix-blend-multiply before:bg-noise-pattern"
                    visibleContextNoteIds={visibleContextNoteIds}
                  />
                  <div className="flex flex-col items-center space-y-2 absolute bottom-2 right-2 z-20">
                    <VaultButton
                      onClick={toggleNotes}
                      size="small"
                      title={showNotes ? "Hide Notes" : "Show Notes"}
                    >
                      <CopyIcon className="w-3 h-3" />
                    </VaultButton>
                  </div>
                  <div className="absolute top-2 left-2 text-sm/7 z-10 flex flex-col items-start justify-self gap-2">
                    {hasUnsavedChanges && <DotIcon className="text-yellow-200" />}
                  </div>
                  {vault &&
                    currentFileId !== null &&
                    memoizedDroppedNotes.length > 0 &&
                    !isNotesLoading && (
                      <ContextNotes
                        className={`${isEditMode ? "block" : "hidden"}`}
                        editorViewRef={codeMirrorViewRef}
                        readingModeRef={readingModeRef}
                        droppedNotes={memoizedDroppedNotes}
                        isEditMode={isEditMode}
                        fileId={currentFileId}
                        vaultId={vaultId}
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
                        basicSetup={memoizedBasicSetup} // Use memoized object
                        indentWithTab={true}
                        extensions={memoizedExtensions}
                        onChange={onContentChange}
                        className="overflow-auto h-full mx-8 scrollbar-hidden pt-2"
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
                {showNotes && currentFileId !== null && (
                  <div className={cn("flex flex-col", showNotes ? "w-88 visible" : "w-0 hidden")}>
                    <LoadingProvider>
                      <LoadingContextSynchronizer
                        isNotesLoading={isNotesLoading}
                        isNotesRecentlyGenerated={isNotesRecentlyGenerated}
                      />
                      <NotesPanel
                        notes={notes}
                        isNotesLoading={isNotesLoading}
                        notesError={notesError}
                        currentReasoningElapsedTime={currentReasoningElapsedTime}
                        currentlyGeneratingDateKey={currentlyGeneratingDateKey}
                        currentGenerationNotes={currentGenerationNotes}
                        droppedNotes={droppedNotes}
                        streamingReasoning={streamingReasoning}
                        reasoningComplete={reasoningComplete}
                        fileId={currentFileId}
                        vaultId={vault?.id}
                        currentReasoningId={currentReasoningId}
                        reasoningHistory={reasoningHistory}
                        handleNoteDropped={handleNoteDropped}
                        handleNoteRemoved={handleNoteRemoved}
                        handleCurrentGenerationNote={handleCurrentGenerationNote}
                        noteGroupsData={noteGroupsData}
                        notesContainerRef={notesContainerRef}
                        streamingNotes={streamingNotes}
                        scanAnimationComplete={scanAnimationComplete}
                        generateNewSuggestions={generateNewSuggestions}
                      />
                    </LoadingProvider>
                  </div>
                )}
              </section>
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
