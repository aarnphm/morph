import { cn, sanitizeStreamingContent } from "@/lib"
import { generatePastelColor } from "@/lib/notes"
import { NOTES_DND_TYPE } from "@/lib/notes"
import {
  GeneratedNote,
  NewlyGeneratedNotes,
  SuggestionRequest,
  SuggestionResponse,
  checkAgentAvailability,
  checkAgentHealth,
} from "@/services/agents"
import { submitNoteForEmbedding, useProcessPendingEmbeddings } from "@/services/notes"
import { createId } from "@paralleldrive/cuid2"
import { Cross2Icon, MixerHorizontalIcon, ShadowInnerIcon } from "@radix-ui/react-icons"
import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDrop } from "react-dnd"
import { Components, Virtuoso } from "react-virtuoso"
import { toast } from "sonner"

import { DraggableNoteCard, NoteCard } from "@/components/note-card"
import { DateDisplay, NoteGroup } from "@/components/note-group"
import { md } from "@/components/parser"
import { ReasoningPanel } from "@/components/reasoning-panel"
import {
  AuthorsSelector,
  SuggestionsSlider,
  TemperatureSlider,
  TonalityRadar,
} from "@/components/steering-panel"
import { VaultButton } from "@/components/ui/button"

import { usePGlite } from "@/context/db"
import { useEmbeddingTasks } from "@/context/embedding"
import { SteeringSettings, useSteeringContext } from "@/context/steering"

import type { Note } from "@/db/interfaces"
import * as schema from "@/db/schema"

interface NotesPanelProps {
  notes: Note[]
  droppedNotes: Note[]
  fileId: string
  vaultId: string
  handleNoteDropped: (note: Note) => void
  handleNoteRemoved: (noteId: string) => void
  noteGroupsData: [string, Note[]][]
  notesContainerRef: React.RefObject<HTMLDivElement | null>
  streamingNotes?: StreamingNote[]
  scanAnimationComplete?: boolean
  markdownContent?: string
  currentFileHandle?: FileSystemFileHandle | null
}

export interface StreamingNote {
  id: string
  content: string
  color: string
  isComplete: boolean
  isScanComplete?: boolean
}

export interface ReasoningHistory {
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

const ScrollSeekPlaceholder: Components["ScrollSeekPlaceholder"] = memo(
  function ScrollSeekPlaceholder({ height }) {
    // Memoize the skeleton components to prevent re-renders
    const skeletonComponents = useMemo(() => {
      // Generate colors once
      const colors = Array.from({ length: 5 }).map(() => generatePastelColor())
      return colors.map((color, i) => (
        <NoteCard
          key={i}
          color={color}
          className="w-full h-32 animate-shimmer"
          variant="skeleton"
        />
      ))
    }, [])

    return (
      <div className="p-1 border border-border bg-muted/20 flex" style={{ height }}>
        <div className="flex flex-col gap-4 w-full">{skeletonComponents}</div>
      </div>
    )
  },
)

interface HistoricalNotesProps {
  fileId: string
  noteGroupsData: [string, Note[]][]
  reasoningHistory: ReasoningHistory[]
  handleNoteDropped: (note: Note) => void
  handleNoteRemoved: (noteId: string) => void
  vaultId?: string
  notesContainerRef: React.RefObject<HTMLDivElement | null>
}

// Extract HistoricalNotes into a separate memoized component
const HistoricalNotes = memo(
  function HistoricalNotes({
    fileId,
    noteGroupsData,
    reasoningHistory,
    handleNoteDropped,
    handleNoteRemoved,
    vaultId,
    notesContainerRef,
  }: HistoricalNotesProps) {
    const memoizedNoteSkeletons = useMemo(() => <NoteCard variant="skeleton" />, [])

    const itemContent = useCallback(
      (_index: number, group: [string, Note[]]) => {
        // Add a safety check for when group is undefined or not properly formed
        if (!group || !Array.isArray(group) || group.length < 2) {
          return memoizedNoteSkeletons
        }

        const [dateStr, dateNotes] = group

        // Only handle historical notes now
        const dateReasoning = reasoningHistory.find((r) =>
          r.noteIds.some((id) => dateNotes.some((note: Note) => note.id === id)),
        )

        return (
          <div className="mb-6">
            <NoteGroup
              dateStr={dateStr}
              dateNotes={dateNotes}
              reasoning={dateReasoning}
              fileId={fileId}
              vaultId={vaultId}
              handleNoteDropped={handleNoteDropped}
              onNoteRemoved={handleNoteRemoved}
              isGenerating={false}
            />
          </div>
        )
      },
      [
        fileId,
        memoizedNoteSkeletons,
        vaultId,
        handleNoteDropped,
        handleNoteRemoved,
        reasoningHistory,
      ],
    )

    return (
      <div className="flex-1 min-h-0">
        <Virtuoso
          key={`note-list-${fileId}-${noteGroupsData.length}`}
          style={{ height: "100%", width: "100%" }}
          totalCount={noteGroupsData.length}
          data={noteGroupsData}
          overscan={10}
          components={{ ScrollSeekPlaceholder }}
          itemContent={itemContent}
          initialItemCount={1}
          increaseViewportBy={{ top: 100, bottom: 100 }}
          scrollSeekConfiguration={{
            enter: (velocity) => Math.abs(velocity) > 1000,
            exit: (velocity) => Math.abs(velocity) < 100,
          }}
          customScrollParent={notesContainerRef.current!}
        />
      </div>
    )
  },
  // Custom comparison function for props to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    // Only re-render if these specific props change
    return (
      prevProps.fileId === nextProps.fileId &&
      prevProps.noteGroupsData === nextProps.noteGroupsData &&
      prevProps.reasoningHistory === nextProps.reasoningHistory
    )
  },
)

// Create a memoized driver bar component for the notes panel
interface DriversBarProps {
  handleGenerateNewSuggestions: (steeringSettings: SteeringSettings) => void
  isNotesRecentlyGenerated: boolean
  isNotesLoading: boolean
}

const DriversBarButtons = memo(function DriversBarButtons({
  onToggleSteeringPanel,
  onGenerateNewSuggestions,
  isNotesRecentlyGenerated,
  isNotesLoading,
}: {
  onToggleSteeringPanel: () => void
  onGenerateNewSuggestions: () => void
  isNotesRecentlyGenerated: boolean
  isNotesLoading: boolean
}) {
  return (
    <div className="flex items-center justify-end gap-3 p-2">
      <VaultButton
        onClick={onToggleSteeringPanel}
        size="small"
        color="yellow"
        title="Interpreter Settings"
      >
        <MixerHorizontalIcon className="h-3 w-3" />
      </VaultButton>
      <VaultButton
        onClick={onGenerateNewSuggestions}
        disabled={isNotesLoading}
        color="none"
        size="small"
        className={cn(
          "text-primary border border-accent-foreground/40",
          !isNotesRecentlyGenerated && "button-shimmer-border",
          isNotesLoading && "cursor-not-allowed opacity-50 hover:cursor-not-allowed",
        )}
        title="Generate Suggestions"
      >
        <ShadowInnerIcon className="w-3 h-3" />
      </VaultButton>
    </div>
  )
})

export const DriversBar = memo(function DriversBar({
  handleGenerateNewSuggestions,
  isNotesRecentlyGenerated,
  isNotesLoading,
}: DriversBarProps) {
  const [isSteeringExpanded, setIsSteeringExpanded] = useState(false)
  const {
    settings,
    updateAuthors,
    updateTonality,
    updateTemperature,
    updateNumSuggestions,
    toggleTonality,
  } = useSteeringContext()

  const toggleSteeringPanel = useCallback(() => {
    setIsSteeringExpanded((prev) => !prev)
  }, [])

  // Close steering panel when the notes panel is closed
  useEffect(() => {
    return () => {
      // This cleanup function will run when the component unmounts
      // (which happens when the notes panel is closed)
      if (isSteeringExpanded) {
        setIsSteeringExpanded(false)
      }
    }
  }, [isSteeringExpanded])

  // Handler functions for steering controls
  const handleUpdateAuthors = useCallback(
    (authors: string[]) => {
      updateAuthors(authors)
    },
    [updateAuthors],
  )

  const handleUpdateTonality = useCallback(
    (tonality: Record<string, number>) => {
      updateTonality(tonality)
    },
    [updateTonality],
  )

  const handleUpdateTemperature = useCallback(
    (temperature: number) => {
      updateTemperature(temperature)
    },
    [updateTemperature],
  )

  const handleUpdateNumSuggestions = useCallback(
    (numSuggestions: number) => {
      updateNumSuggestions(numSuggestions)
    },
    [updateNumSuggestions],
  )

  const handleToggleTonality = useCallback(
    (enabled: boolean) => {
      toggleTonality(enabled)
    },
    [toggleTonality],
  )

  const handleGenerate = useCallback(() => {
    handleGenerateNewSuggestions(settings)
  }, [handleGenerateNewSuggestions, settings])

  return (
    <div className="flex flex-col border-t bg-background/95 backdrop-blur-sm shadow-md z-10 relative">
      {isSteeringExpanded && (
        <div className="px-4 pb-2 overflow-hidden border-b border-border">
          <div className="pt-4 flex justify-between items-center">
            <h2 className="text-base font-semibold">Interpreter</h2>
            <button
              onClick={() => setIsSteeringExpanded(false)}
              className="flex items-center justify-center h-5 w-5 hover:bg-muted rounded-sm"
            >
              <Cross2Icon className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-6 pt-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="pb-4 border-b border-border">
              <AuthorsSelector value={settings.authors} onChange={handleUpdateAuthors} />
            </div>

            <div className="pb-4 border-b border-border">
              <TonalityRadar
                value={settings.tonality}
                onChange={handleUpdateTonality}
                enabled={settings.tonalityEnabled}
                onToggle={handleToggleTonality}
              />
            </div>

            <div className="pb-4 border-b border-border">
              <TemperatureSlider value={settings.temperature} onChange={handleUpdateTemperature} />
            </div>

            <div>
              <SuggestionsSlider
                value={settings.numSuggestions}
                onChange={handleUpdateNumSuggestions}
              />
            </div>
          </div>
        </div>
      )}
      <DriversBarButtons
        onToggleSteeringPanel={toggleSteeringPanel}
        onGenerateNewSuggestions={handleGenerate}
        isNotesLoading={isNotesLoading}
        isNotesRecentlyGenerated={isNotesRecentlyGenerated}
      />
    </div>
  )
})

// Create a memoized error display component
const ErrorDisplay = memo(function ErrorDisplay({ error }: { error: string | null }) {
  if (!error) return null

  return (
    <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
      {error}
    </div>
  )
})

const EmptyState = memo(function EmptyState({
  notes,
  droppedNotes,
  isNotesLoading,
}: {
  notes: Note[]
  droppedNotes: Note[]
  isNotesLoading: boolean
}) {
  if (isNotesLoading || notes.length !== 0) return null
  return (
    <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground p-4 pt-0">
      <p className="mb-4">
        {droppedNotes.length !== 0
          ? "All notes are currently in the stack."
          : "No notes found for this document"}
      </p>
    </div>
  )
})

export const NotesPanel = memo(function NotesPanel({
  notes: initialNotes,
  droppedNotes: initialDroppedNotes,
  vaultId,
  fileId,
  handleNoteDropped,
  handleNoteRemoved,
  noteGroupsData,
  notesContainerRef,
  markdownContent: initialMarkdownContent,
  currentFileHandle: initialFileHandle,
}: NotesPanelProps) {
  // Get steering settings and fileId update function from context
  const { settings, updateFileId } = useSteeringContext()

  const { addTask } = useEmbeddingTasks()

  // State management (moved from editor.tsx)
  const [notes, setNotes] = useState<Note[]>(initialNotes || [])
  const [notesError, setNotesError] = useState<string | null>(null)
  const [currentlyGeneratingDateKey, setCurrentlyGeneratingDateKey] = useState<string | null>(null)
  const [currentGenerationNotes, setCurrentGenerationNotes] = useState<Note[]>([])
  const [droppedNotes, setDroppedNotes] = useState<Note[]>(initialDroppedNotes || [])

  // Additional state
  const [isNotesLoading, setIsNotesLoading] = useState(false)
  const [scanAnimationComplete, setScanAnimationComplete] = useState(false)
  const [currentReasoningElapsedTime, setCurrentReasoningElapsedTime] = useState(0)
  const [lastNotesGeneratedTime, setLastNotesGeneratedTime] = useState<Date | null>(null)
  const [currentReasoningId, setCurrentReasoningId] = useState<string>("")
  const [streamingSuggestionColors, setStreamingSuggestionColors] = useState<string[]>([])
  const [streamingNotes, setStreamingNotes] = useState<StreamingNote[]>([])
  const [reasoningComplete, setReasoningComplete] = useState(false)
  const [streamingReasoning, setStreamingReasoning] = useState<string>("")
  const [reasoningHistory, setReasoningHistory] = useState<ReasoningHistory[]>([])
  const [markdownContent, setMarkdownContent] = useState<string>(initialMarkdownContent || "")
  const [currentFileHandle, setCurrentFileHandle] = useState<FileSystemFileHandle | null>(
    initialFileHandle || null,
  )

  const embeddingProcessedRef = useRef<string | null>(null)

  // Track settings changes with a ref to detect actual value changes
  const prevSettingsRef = useRef(settings)
  const currentFileIdRef = useRef<string | null>(null)

  const client = usePGlite()
  const db = useMemo(() => drizzle({ client, schema }), [client])

  const processEmbeddings = useProcessPendingEmbeddings(db)

  // Load file metadata when fileId changes
  const loadFileMetadata = useCallback(
    async (fileId: string) => {
      if (!vaultId || fileId === null) return

      try {
        console.log(`[Notes Debug] Starting to load metadata for file ${fileId}`)

        // Find the file in database
        const dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) => and(eq(files.id, fileId), eq(files.vaultId, vaultId)),
        })

        // If file doesn't exist in DB, log error and return
        if (!dbFile) {
          console.error(`File ${fileId} does not exist in db. Something has gone very wrong`)
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

          // Process embeddings if needed
          if (fileNotes && fileNotes.length > 0 && !embeddingProcessedRef.current) {
            console.log(`[Notes Debug] Processing embeddings for ${fileNotes.length} notes`)
            processEmbeddings.mutate({ addTask })
            embeddingProcessedRef.current = `${vaultId}:${fileId}`
          }
        } catch (error) {
          console.error("Error fetching notes for file:", error)
          // Reset note states on error
          setCurrentGenerationNotes([])
          setNotesError(
            `Failed to load notes: ${error instanceof Error ? error.message : "Unknown error"}`,
          )
          setNotes([])
          setDroppedNotes([])
          setReasoningHistory([])
        }
      } catch (dbError) {
        console.error("Error with database operations:", dbError)
        setNotesError(
          `Database error: ${dbError instanceof Error ? dbError.message : "Unknown error"}`,
        )
      }
    },
    [db, vaultId, processEmbeddings, addTask],
  )

  // Load file metadata when fileId changes
  // useEffect(() => {
  //   if (fileId) {
  //     loadFileMetadata(fileId)
  //     currentFileIdRef.current = fileId
  //   } else {
  //     // Reset state when fileId is null
  //     setNotes([])
  //     setDroppedNotes([])
  //     setReasoningHistory([])
  //     setCurrentGenerationNotes([])
  //     setCurrentlyGeneratingDateKey(null)
  //     setNotesError(null)
  //     embeddingProcessedRef.current = null
  //   }
  // }, [fileId, loadFileMetadata])

  // When unmounting or when fileId changes, save any pending notes to DB
  useEffect(() => {
    return () => {
      // Save current generation notes to DB when unmounting
      if (currentGenerationNotes.length > 0 && currentlyGeneratingDateKey && fileId) {
        console.log(
          `[Notes Debug] Saving ${currentGenerationNotes.length} current generation notes to DB on unmount`,
        )

        // We can't await in useEffect cleanup, so we use a fire-and-forget approach
        // This is okay for cleanup operations
        const saveNotes = async () => {
          try {
            // Find the file in database
            const dbFile = await db.query.files.findFirst({
              where: (files, { and, eq }) =>
                and(eq(files.id, fileId), eq(files.vaultId, vaultId || "")),
            })

            if (!dbFile) {
              console.error("Failed to find file in database when saving notes on unmount")
              return
            }

            // For each note, ensure it's saved to database if not already
            for (const note of currentGenerationNotes) {
              const existingNote = await db.query.notes.findFirst({
                where: eq(schema.notes.id, note.id),
              })

              if (!existingNote) {
                console.log(`[Notes Debug] Saving note ${note.id} to DB on unmount`)

                await db.insert(schema.notes).values({
                  id: note.id,
                  content: note.content,
                  color: note.color,
                  createdAt: note.createdAt,
                  accessedAt: new Date(),
                  dropped: note.dropped ?? false,
                  fileId: dbFile.id,
                  vaultId: note.vaultId,
                  reasoningId: note.reasoningId || null,
                  steering: note.steering || null,
                  embeddingStatus: "in_progress",
                  embeddingTaskId: null,
                })
              }
            }
          } catch (error) {
            console.error("Failed to save notes to database on unmount:", error)
          }
        }

        saveNotes()
      }
    }
  }, [currentGenerationNotes, currentlyGeneratingDateKey, fileId, vaultId, db])

  // Update markdownContent and vault state with props
  useEffect(() => {
    if (initialMarkdownContent) {
      setMarkdownContent(initialMarkdownContent)
    }
    if (initialFileHandle) {
      setCurrentFileHandle(initialFileHandle)
    }
  }, [initialMarkdownContent, initialFileHandle])

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
          toast(`Services unavailable: ${unhealthyServices}`)
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
            toast.error(errorMsg)
            throw new Error(errorMsg)
          }

          if (!response.body) {
            const errorMsg = "Response body is empty"
            toast.error(errorMsg)
            throw new Error(errorMsg)
          }
        } catch (suggestError: any) {
          const errorMsg = `Failed to get suggestions: ${suggestError.message || "Unknown error"}`
          toast.error(errorMsg)
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
            toast.error("Failed to parse suggestion data")
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

        // Ensure we return a rejected promise
        return Promise.reject(error)
      }
    },
    [toast, droppedNotes],
  )

  // Check if notes were recently generated (within the last 5 minutes)
  const isNotesRecentlyGenerated = useMemo(() => {
    if (!lastNotesGeneratedTime) return false
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes in milliseconds
    return lastNotesGeneratedTime > fiveMinutesAgo
  }, [lastNotesGeneratedTime])

  // Fix typing in the generateNewSuggestions function
  const generateNewSuggestions = useCallback(
    async (steeringSettings: SteeringSettings) => {
      if (!vaultId || !fileId || !markdownContent) {
        console.log("[Notes Debug] Cannot generate suggestions - missing vault, file or content")
        return
      }

      console.log(`[Notes Debug] Starting to generate new suggestions with settings:`, {
        numSuggestions: steeringSettings.numSuggestions,
        hasAuthors: !!steeringSettings.authors,
        temperature: steeringSettings.temperature,
        hasTonality: steeringSettings.tonalityEnabled,
      })

      // Move current generation notes to history by adding them to notes array
      if (currentGenerationNotes.length > 0) {
        console.log(
          `[Notes Debug] Moving ${currentGenerationNotes.length} current generation notes to history`,
        )
        // First ensure the current notes are in the main notes array (if they aren't already)
        setNotes((prev: Note[]) => {
          // Filter out any notes that might already exist in the array
          const notesToAdd = currentGenerationNotes.filter(
            (note) => !prev.some((existingNote: Note) => existingNote.id === note.id),
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
          where: (files, { and, eq }) => and(eq(files.id, fileId), eq(files.vaultId, vaultId)),
        })

        console.log(`[Notes Debug] Found file in DB: ${dbFile?.id || "not found"}`)

        if (!dbFile) {
          if (!currentFileHandle) {
            console.error("[Notes Debug] No file handle available to create DB entry")
            throw new Error("No file handle available")
          }

          console.log(
            `[Notes Debug] File not found in DB, creating new file entry for ${currentFileHandle.name}`,
          )
          // Insert file into database
          await db.insert(schema.files).values({
            id: fileId,
            name: currentFileHandle.name,
            extension: "md",
            vaultId: vaultId,
            lastModified: new Date(),
            embeddingStatus: "in_progress",
          })

          // Re-fetch the file to get its ID
          dbFile = await db.query.files.findFirst({
            where: (files, { and, eq }) => and(eq(files.id, fileId), eq(files.vaultId, vaultId)),
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
          const newNotes = generatedNotes.map((note, index) => {
            const id = createId()
            newNoteIds.push(id)
            return {
              id,
              content: note.content,
              color: streamingSuggestionColors[index] || generatePastelColor(),
              fileId: dbFile!.id, // Use the actual DB file ID here
              vaultId,
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
            } as Note
          })

          // Prepare the reasoning record to be saved
          const reasoningRecordToSave = {
            id: reasoningId,
            fileId: dbFile!.id,
            vaultId,
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
          if (fileId && newNotes.length > 0) {
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

              setNotes((prev: Note[]) => {
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
              setNotes((prev: Note[]) => {
                const combined = [...newNotes, ...prev]
                return combined.sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                )
              })
            }
          } else {
            // For unsaved files, just display in UI without saving to DB
            console.log(`[Notes Debug] Displaying ephemeral notes for unsaved file`)
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
            setNotes((prev: Note[]) => {
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
      fileId,
      fetchNewNotes,
      markdownContent,
      db,
      currentGenerationNotes,
      addTask,
      streamingSuggestionColors,
      currentFileHandle,
    ],
  )

  // Add effect to properly track settings changes
  useEffect(() => {
    if (JSON.stringify(prevSettingsRef.current) !== JSON.stringify(settings)) {
      prevSettingsRef.current = settings
    }
  }, [settings])

  // Add effect to update fileId in steering context when it changes
  useEffect(() => {
    // Skip for non-persisted files
    if (!fileId) {
      updateFileId(null)
      currentFileIdRef.current = null
      return
    }

    // Find the file ID from notes array
    if (notes.length > 0 && notes[0].fileId && currentFileIdRef.current !== notes[0].fileId) {
      currentFileIdRef.current = notes[0].fileId
      updateFileId(notes[0].fileId)
    }
  }, [notes, updateFileId, fileId])

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: NOTES_DND_TYPE,
      drop(item: Note) {
        if (item.dropped) {
          item.dropped = false
        }
        return { targetId: "notes-panel" }
      },
      collect: (monitor) => ({ isOver: monitor.isOver() }),
    }),
    [],
  )

  const dropRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        drop(element)
      }
    },
    [drop],
  )

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

  return (
    <div
      ref={dropRef}
      className={cn(
        "flex flex-col border-l h-full",
        isOver && "border-red-200 border rounded-e-md rounded-n-md",
      )}
    >
      <div className="flex-1 overflow-auto scrollbar-hidden px-2 pt-2 gap-4 min-h-0">
        <EmptyState notes={notes} droppedNotes={droppedNotes} isNotesLoading={isNotesLoading} />
        <div className="space-y-6 h-full">
          <div
            className={cn("h-full flex flex-col overflow-auto scrollbar-hidden scroll-smooth")}
            ref={notesContainerRef}
          >
            <ErrorDisplay error={notesError} />
            {/* Only show current generation section if there are active notes in it */}
            {!notesError &&
              currentlyGeneratingDateKey &&
              (isNotesLoading ||
                (!scanAnimationComplete && reasoningComplete) ||
                (scanAnimationComplete &&
                  currentGenerationNotes.length > 0 &&
                  !droppedNotes.some((d) => d.id === currentGenerationNotes[0]?.id))) && (
                <div className="space-y-4 flex-shrink-0 mb-6">
                  <div className="mb-2 space-y-4 bg-background">
                    <DateDisplay dateStr={currentlyGeneratingDateKey!} />

                    <ReasoningPanel
                      reasoning={streamingReasoning}
                      isStreaming={isNotesLoading && !reasoningComplete}
                      isComplete={reasoningComplete}
                      vaultId={vaultId}
                      reasoningId={currentReasoningId}
                      shouldExpand={isNotesLoading || currentGenerationNotes.length > 0}
                      elapsedTime={currentReasoningElapsedTime}
                    />
                  </div>

                  {/* Show streaming notes during generation phase */}
                  {reasoningComplete &&
                    !scanAnimationComplete &&
                    streamingNotes &&
                    streamingNotes.length > 0 && (
                      <div className="grid gap-4">
                        {streamingNotes.map((note) => (
                          <NoteCard
                            key={note.id}
                            color={generatePastelColor()}
                            className={cn(
                              "w-full h-full",
                              !note.isComplete && "will-change-contents",
                            )}
                            note={{
                              id: note.id,
                              content: note.content,
                              color: generatePastelColor(),
                              fileId,
                              vaultId: vaultId,
                              createdAt: new Date(),
                              embeddingStatus: null,
                              embeddingTaskId: null,
                            }}
                            isGenerating={!note.isComplete}
                            isStreaming={!note.isComplete}
                            isScanComplete={note.isScanComplete}
                          />
                        ))}
                      </div>
                    )}

                  {/* Show actual generated notes when complete */}
                  {!isNotesLoading &&
                    scanAnimationComplete &&
                    currentGenerationNotes.length > 0 &&
                    !notesError && (
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          className="space-y-4 px-2"
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0 }}
                        >
                          {currentGenerationNotes.map((note) => (
                            <DraggableNoteCard
                              key={note.id}
                              note={note}
                              handleNoteDropped={handleNoteDropped}
                              onNoteRemoved={handleNoteRemoved}
                              onCurrentGenerationNote={handleCurrentGenerationNote}
                              isGenerating={false}
                            />
                          ))}
                        </motion.div>
                      </AnimatePresence>
                    )}
                </div>
              )}

            <HistoricalNotes
              fileId={fileId}
              noteGroupsData={noteGroupsData}
              reasoningHistory={reasoningHistory}
              handleNoteDropped={handleNoteDropped}
              handleNoteRemoved={handleNoteRemoved}
              vaultId={vaultId}
              notesContainerRef={notesContainerRef}
            />
          </div>
        </div>
      </div>
      <DriversBar
        handleGenerateNewSuggestions={generateNewSuggestions}
        isNotesLoading={isNotesLoading}
        isNotesRecentlyGenerated={isNotesRecentlyGenerated}
      />
    </div>
  )
})

// Function to log notes for a file (utility function)
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
