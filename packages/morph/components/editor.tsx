"use client"

import * as React from "react"
import { useEffect, useCallback, useState, useRef, useMemo, memo } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { EditorView } from "@codemirror/view"
import { Compartment, EditorState } from "@codemirror/state"
import {
  ShadowInnerIcon,
  StackIcon,
  Cross2Icon,
  CopyIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons"
import usePersistedSettings from "@/hooks/use-persisted-settings"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Vim, vim } from "@replit/codemirror-vim"
import { DraggableNoteCard, NoteCard, AttachedNoteCard } from "@/components/note-card"
import { fileField, mdToHtml } from "@/components/markdown-inline"
import { toJsx, cn } from "@/lib"
import type { Root } from "hast"
import { useTheme } from "next-themes"
import { useVaultContext } from "@/context/vault-context"
import { md, frontmatter, syntaxHighlighting, theme as editorTheme } from "@/components/parser"
import { setFile } from "@/components/markdown-inline"
import { DotIcon } from "@/components/ui/icons"
import { SearchProvider } from "@/context/search-context"
import { SearchCommand } from "@/components/search-command"
import { DndProvider, useDrop, useDragLayer } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import { NotesProvider } from "@/context/notes-context"
import { generatePastelColor } from "@/lib/notes"
import { db, type Note, type Vault, type FileSystemTreeNode } from "@/db"
import { createId } from "@paralleldrive/cuid2"
import { ReasoningPanel } from "@/components/reasoning-panel"
import { Virtuoso, Components } from "react-virtuoso"
import { NOTES_DND_TYPE } from "@/lib/notes"
import { motion, AnimatePresence } from "motion/react"
import { VaultButton } from "@/components/ui/button"
import Rails from "@/components/rails"
import SteeringPanel from "@/components/steering-panel"
import { SteeringProvider, SteeringSettings, useSteeringContext } from "@/context/steering-context"

interface StreamingDelta {
  suggestion: string
  reasoning: string
  usage: {
    completion_tokens: number
    prompt_tokens: number
    total_tokens: number
    completion_tokens_details?: any
    prompt_tokens_details?: any
  } | null
}

interface Suggestions {
  suggestions: { suggestion: string }[]
}

interface StreamingNote {
  id: string
  content: string
  color: string
  isComplete: boolean
  isScanComplete?: boolean
}

interface EditorProps {
  vaultId: string
  vaults: Vault[]
}

interface GeneratedNote {
  content: string
}

interface ReadinessResponse {
  healthy: boolean
  services: { name: string; healthy: boolean; latency_ms: number; error: string }[]
  timestamp: string
}

interface DateDisplayProps {
  dateStr: string
  formatDate: (dateStr: string) => React.ReactNode
}

const DateDisplay = memo(function DateDisplay({ dateStr, formatDate }: DateDisplayProps) {
  return (
    <div className="bg-muted px-3 py-1.5 text-xs text-muted-foreground font-medium border rounded-md border-border">
      {formatDate(dateStr)}
    </div>
  )
})

interface NoteGroupProps {
  dateStr: string
  dateNotes: Note[]
  reasoning?: {
    id: string
    content: string
    reasoningElapsedTime: number
  }
  currentFile: string
  vaultId?: string
  handleNoteDropped: (note: Note) => void
  onNoteRemoved: (noteId: string) => void
  formatDate: (dateStr: string) => React.ReactNode
  isGenerating?: boolean
}

const MemoizedNoteGroup = memo(
  function MemoizedNoteGroup({
    dateStr,
    dateNotes,
    reasoning,
    currentFile,
    vaultId,
    handleNoteDropped,
    onNoteRemoved,
    formatDate,
    isGenerating = false,
  }: NoteGroupProps) {
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

    const MemoizedReasoningPanel = useMemo(() => {
      if (!reasoning) return null
      return (
        <div className="px-2 bg-background">
          <ReasoningPanel
            reasoning={reasoning.content}
            isStreaming={false}
            isComplete={true}
            currentFile={currentFile}
            vaultId={vaultId}
            reasoningId={reasoning.id}
            shouldExpand={false}
            elapsedTime={reasoning.reasoningElapsedTime || 0}
          />
        </div>
      )
    }, [reasoning, currentFile, vaultId])

    return (
      <div className="space-y-4">
        <DateDisplay dateStr={dateStr} formatDate={formatDate} />
        {MemoizedReasoningPanel}
        <div className="grid gap-4">
          {memoizedNotes.map((note) => (
            <DraggableNoteCard
              key={note.id}
              note={note}
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
    return (
      prevProps.dateStr === nextProps.dateStr &&
      prevProps.dateNotes === nextProps.dateNotes &&
      prevProps.reasoning === nextProps.reasoning &&
      prevProps.currentFile === nextProps.currentFile &&
      prevProps.isGenerating === nextProps.isGenerating
    )
  },
)

interface DroppedNotesStackProps {
  droppedNotes: Note[]
  isStackExpanded: boolean
  onExpandStack: () => void
  onDragBackToPanel: (noteId: string) => void
  className?: string
}

const DroppedNotesStack = memo(
  function DroppedNotesStack({
    droppedNotes,
    isStackExpanded,
    onExpandStack,
    onDragBackToPanel,
    className,
  }: DroppedNotesStackProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const lastNoteRef = useRef<HTMLDivElement>(null)
    const prevNotesLengthRef = useRef(droppedNotes.length)
    const MAX_VISIBLE_NOTES = 5
    const hasMoreNotes = droppedNotes.length > MAX_VISIBLE_NOTES
    const hasNotes = droppedNotes.length > 0

    // Get notes to display - either first 5 or all (limited to 20 for performance)
    const notesToDisplay = useMemo(
      () => (isStackExpanded ? droppedNotes : droppedNotes.slice(0, MAX_VISIBLE_NOTES)),
      [droppedNotes, isStackExpanded],
    )

    // Scroll to the newly added note when in expanded mode
    useEffect(() => {
      // Check if a new note was added
      if (
        droppedNotes.length > prevNotesLengthRef.current &&
        isStackExpanded &&
        lastNoteRef.current &&
        scrollContainerRef.current
      ) {
        // Scroll to the last note
        lastNoteRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
      }

      // Update the reference for next comparison
      prevNotesLengthRef.current = droppedNotes.length
    }, [droppedNotes.length, isStackExpanded])

    // Modified to provide a ref to the last note and pass the onDragBackToPanel handler
    const AttachedDisplayNotes = useCallback(
      () => (
        <>
          {notesToDisplay.map((note, index) => (
            <AttachedNoteCard
              key={index}
              note={note}
              index={index}
              isStackExpanded={isStackExpanded}
              onDragBackToPanel={onDragBackToPanel}
              className={className}
            />
          ))}
        </>
      ),
      [isStackExpanded, notesToDisplay, onDragBackToPanel, className],
    )

    // Render nothing if there are no notes
    if (!hasNotes) return null

    return (
      <div
        ref={containerRef}
        className={cn(
          "absolute top-4 right-4 z-40",
          isStackExpanded && "bg-background/80 backdrop-blur-sm border rounded-md shadow-md p-2",
        )}
      >
        <div
          ref={scrollContainerRef}
          className={cn(
            "flex flex-col items-center gap-1.5",
            isStackExpanded && "max-h-[20vh] overflow-y-auto scrollbar-hidden",
          )}
        >
          <AnimatePresence mode="sync" key={`validate-${droppedNotes.length}`}>
            <AttachedDisplayNotes />
            {hasMoreNotes && !isStackExpanded && (
              <motion.div
                className="text-primary/50 cursor-pointer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                title={`${droppedNotes.length - MAX_VISIBLE_NOTES} more notes`}
              >
                <motion.div
                  animate={{ y: [0, 4, 0] }}
                  transition={{
                    duration: 2,
                    ease: "easeInOut",
                    repeat: Infinity,
                  }}
                  onClick={onExpandStack}
                >
                  <ChevronDownIcon className="w-4 h-4" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
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
    if (prevProps.onDragBackToPanel !== nextProps.onDragBackToPanel) {
      return false // Re-render if the handler changed
    }

    // Check if any note content or IDs have changed
    return prevProps.droppedNotes.every((prevNote, index) => {
      const nextNote = nextProps.droppedNotes[index]
      return prevNote.id === nextNote.id && prevNote.color === nextNote.color
    })
  },
)

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

// Create a memoized driver bar component for the notes panel
interface DriversBarProps {
  handleGenerateNewSuggestions: () => void
  isNotesLoading: boolean
  isNotesRecentlyGenerated: boolean
}

const DriversBar = memo(
  function DriversBar({
    handleGenerateNewSuggestions,
    isNotesLoading,
    isNotesRecentlyGenerated,
  }: DriversBarProps) {
    return (
      <div className="flex items-center justify-end gap-3 p-2 border-t bg-background/95 backdrop-blur-sm shadow-md z-10 relative">
        <VaultButton
          onClick={handleGenerateNewSuggestions}
          disabled={isNotesLoading}
          color="none"
          size="small"
          className={cn(
            "text-primary border border-accent-foreground/40",
            !isNotesRecentlyGenerated && "button-shimmer-border",
          )}
          title="Generate Suggestions"
        >
          <ShadowInnerIcon className="w-3 h-3" />
        </VaultButton>
      </div>
    )
  },
  // Include all props in equality check
  (prevProps, nextProps) =>
    prevProps.isNotesLoading === nextProps.isNotesLoading &&
    prevProps.isNotesRecentlyGenerated === nextProps.isNotesRecentlyGenerated &&
    prevProps.handleGenerateNewSuggestions === nextProps.handleGenerateNewSuggestions,
)

interface NotesPanelProps {
  notes: Note[]
  isNotesLoading: boolean
  notesError: string | null
  currentlyGeneratingDateKey: string | null
  currentGenerationNotes: Note[]
  droppedNotes: Note[]
  streamingReasoning: string
  reasoningComplete: boolean
  currentFile: string
  vaultId?: string
  currentReasoningId: string
  reasoningHistory: {
    id: string
    content: string
    timestamp: Date
    noteIds: string[]
    reasoningElapsedTime: number
  }[]
  handleNoteDropped: (note: Note) => void
  handleNoteRemoved: (noteId: string) => void
  handleCurrentGenerationNote: (note: Note) => void
  formatDate: (dateStr: string) => React.ReactNode
  isNotesRecentlyGenerated: boolean
  currentReasoningElapsedTime: number
  generateNewSuggestions: (steeringSettings: SteeringSettings) => void
  noteGroupsData: [string, Note[]][]
  notesContainerRef: React.RefObject<HTMLDivElement | null>
  streamingNotes?: StreamingNote[]
  scanAnimationComplete?: boolean
}

const CustomDragLayer = memo(function CustomDragLayer() {
  const { isDragging, item, currentOffset } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging(),
    item: monitor.getItem() as Note | null,
    currentOffset: monitor.getSourceClientOffset(),
  }))

  if (!isDragging || !currentOffset || !item) {
    return null
  }

  return (
    <div
      style={{
        position: "fixed",
        pointerEvents: "none", // Important: prevent interference with drop detection
        zIndex: 9999,
        left: 0,
        top: 0,
        transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
        width: "256px",
        maxWidth: "256px",
        opacity: 0.9,
      }}
    >
      <div
        className={cn(
          "p-3 border border-border shadow-xl rounded-sm",
          "transition-shadow",
          "notecard-ragged relative",
          "before:content-[''] before:absolute before:inset-0 before:z-[-1]",
          "before:opacity-50 before:mix-blend-multiply before:bg-noise-pattern",
          "after:content-[''] after:absolute after:bottom-[-4px] after:right-[-4px]",
          "after:left-[4px] after:top-[4px] after:z-[-2]",
          item.color || "bg-muted",
        )}
      >
        <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{item.content}</p>
      </div>
    </div>
  )
})

const NotesPanel = memo(function NotesPanel({
  notes,
  isNotesLoading,
  notesError,
  currentlyGeneratingDateKey,
  currentGenerationNotes,
  droppedNotes,
  streamingReasoning,
  reasoningComplete,
  currentFile,
  vaultId,
  currentReasoningId,
  reasoningHistory,
  handleNoteDropped,
  handleNoteRemoved,
  handleCurrentGenerationNote,
  formatDate,
  isNotesRecentlyGenerated,
  currentReasoningElapsedTime,
  generateNewSuggestions,
  noteGroupsData,
  notesContainerRef,
  streamingNotes,
  scanAnimationComplete,
}: NotesPanelProps) {
  const memoizedNoteSkeletons = useMemo(() => <NoteCard variant="skeleton" />, [])

  // Get steering settings from context
  const { settings } = useSteeringContext()

  // Track settings changes with a ref to detect actual value changes
  const prevSettingsRef = useRef(settings)

  // Add effect to properly track settings changes
  useEffect(() => {
    if (JSON.stringify(prevSettingsRef.current) !== JSON.stringify(settings)) {
      prevSettingsRef.current = settings
    }
  }, [settings])

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
          <MemoizedNoteGroup
            dateStr={dateStr}
            dateNotes={dateNotes}
            reasoning={dateReasoning}
            currentFile={currentFile}
            vaultId={vaultId}
            handleNoteDropped={handleNoteDropped}
            onNoteRemoved={handleNoteRemoved}
            formatDate={formatDate}
            isGenerating={false}
          />
        </div>
      )
    },
    [
      memoizedNoteSkeletons,
      currentFile,
      vaultId,
      handleNoteDropped,
      handleNoteRemoved,
      formatDate,
      reasoningHistory,
    ],
  )

  return (
    <div
      ref={dropRef}
      className={cn(
        "flex flex-col border-l h-full",
        isOver && "border-red-200 border rounded-e-md rounded-n-md",
      )}
    >
      <div className="flex-1 overflow-auto scrollbar-hidden px-2 pt-4 gap-4">
        {!isNotesLoading && notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground p-4">
            <p className="mb-4">
              {droppedNotes.length !== 0
                ? "All notes are currently in the stack."
                : "No notes found for this document"}
            </p>
          </div>
        ) : (
          <div className="space-y-6 h-full">
            {notesError ? (
              <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                {notesError}
              </div>
            ) : (
              <div
                className={cn("h-full flex flex-col overflow-auto scrollbar-hidden scroll-smooth")}
                ref={notesContainerRef}
              >
                {/* Only show current generation section if there are active notes in it */}
                {currentlyGeneratingDateKey &&
                  (isNotesLoading ||
                    (!scanAnimationComplete && reasoningComplete) ||
                    (scanAnimationComplete &&
                      currentGenerationNotes.length > 0 &&
                      !droppedNotes.some((d) => d.id === currentGenerationNotes[0]?.id))) && (
                    <div className="space-y-4 flex-shrink-0 mb-6">
                      <DateDisplay dateStr={currentlyGeneratingDateKey!} formatDate={formatDate} />

                      <div className="px-2 bg-background">
                        <ReasoningPanel
                          reasoning={streamingReasoning}
                          isStreaming={isNotesLoading && !reasoningComplete}
                          isComplete={reasoningComplete}
                          currentFile={currentFile}
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
                          <div className="space-y-4 px-2">
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
                                  fileId: currentFile,
                                  vaultId: vaultId || "",
                                  createdAt: new Date(),
                                  lastModified: new Date(),
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
                          <AnimatePresence mode="wait">
                            <motion.div
                              className="space-y-4 px-2"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.3 }}
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
                <div className="flex-1 min-h-0">
                  <Virtuoso
                    key={`note-list-${currentFile}`}
                    style={{ height: "100%", width: "100%" }}
                    totalCount={noteGroupsData.length}
                    data={noteGroupsData}
                    overscan={5}
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
              </div>
            )}
          </div>
        )}
      </div>
      <DriversBar
        handleGenerateNewSuggestions={() => generateNewSuggestions(settings)}
        isNotesLoading={isNotesLoading}
        isNotesRecentlyGenerated={isNotesRecentlyGenerated}
      />
    </div>
  )
})

interface EditorDropTargetProps {
  children: React.ReactNode
  handleNoteDropped: (note: Note) => void
}

const EditorDropTarget = memo(function EditorDropTarget({
  children,
  handleNoteDropped,
}: EditorDropTargetProps) {
  // Save the handleNoteDropped reference in a ref to avoid dependency changes
  const handleDroppedRef = useRef(handleNoteDropped)
  useEffect(() => {
    handleDroppedRef.current = handleNoteDropped
  }, [handleNoteDropped])

  const onDropped = useCallback(
    (item: Note) => {
      handleNoteDropped(item)
    },
    [handleNoteDropped],
  )

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: NOTES_DND_TYPE,
      drop(item: Note) {
        onDropped(item)
        return { targetId: "editor" }
      },
      collect: (monitor) => ({ isOver: monitor.isOver() }),
    }),
    [onDropped],
  )

  const dropRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        drop(element)
      }
    },
    [drop],
  )

  return (
    <div
      ref={dropRef}
      className={cn(
        "flex-1 relative transition-all duration-300 ease-in-out",
        isOver && "border-teal-300 border rounded-s-md rounded-w-md",
      )}
    >
      {children}
    </div>
  )
})

const Playspace = memo(function Playspace({
  children,
  vaultId,
}: {
  children: React.ReactNode
  vaultId: string
}) {
  return (
    <motion.section
      className="flex flex-1 overflow-hidden m-4 border"
      layout
      layoutId={`vault-card-${vaultId}`}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 26,
        mass: 0.8,
      }}
      initial={{ borderRadius: 0 }}
      animate={{
        margin: "16px",
        borderRadius: "8px",
      }}
      exit={{
        margin: "16px",
        borderRadius: "8px",
        opacity: 0,
      }}
    >
      {children}
    </motion.section>
  )
})

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

interface NewlyGeneratedNotes {
  generatedNotes: GeneratedNote[]
  reasoningId: string
  reasoningElapsedTime: number
  reasoningContent: string
}

// Add a helper function to sanitize streaming content by removing trailing JSON syntax
const sanitizeStreamingContent = (content: string): string => {
  if (!content) return ""

  // Remove any trailing JSON syntax characters that might be part of streaming
  // This handles cases like trailing quotes, braces, commas, etc.
  let sanitized = content

  // First, check if we have an incomplete escape sequence at the end
  if (sanitized.endsWith("\\")) {
    sanitized = sanitized.slice(0, -1)
  }

  // Remove any trailing JSON syntax characters
  sanitized = sanitized.replace(/[\"\}\,\]\s]+$/, "")

  // Also handle cases where there might be escaped quotes
  sanitized = sanitized.replace(/\\\"$/, "")

  return sanitized
}

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
  const [scanAnimationComplete, setScanAnimationComplete] = useState(false)

  const { settings } = usePersistedSettings()
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

  const toggleStackExpand = useCallback(() => {
    setIsStackExpanded((prev) => !prev)
  }, [])

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

  const handleNoteDropped = useCallback(async (note: Note) => {
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

    // Save to database - update the note's dropped flag
    try {
      await db.notes.update(noteWithColor.id, {
        dropped: true,
        color: noteWithColor.color,
        lastModified: new Date(),
      })
    } catch (error) {
      console.error("Failed to update note dropped status:", error)
    }
  }, [])

  useEffect(() => {
    if (!currentFile || !vault) return

    const loadDroppedNotes = async () => {
      try {
        // Get notes that are dropped for this file
        const fileDroppedNotes = await db.notes
          .filter((note) => note.dropped === true && note.fileId === currentFile)
          .toArray()

        // Ensure each note has a color
        const notesWithColors = fileDroppedNotes.map((note) => ({
          ...note,
          color: note.color || generatePastelColor(),
        }))

        setDroppedNotes(notesWithColors)
      } catch (error) {
        console.error("Failed to load dropped notes:", error)
        setDroppedNotes([])
      }
    }

    loadDroppedNotes()
  }, [currentFile, vault])

  useEffect(() => {
    contentRef.current = { content: markdownContent, filename: currentFile }
  }, [markdownContent, currentFile])

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

        console.debug("Services ready:", {
          timestamp: serviceReadiness.timestamp,
          services: serviceReadiness.services.map((s) => ({
            name: s.name,
            latency: s.latency_ms,
          })),
        })

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

        const max_tokens = 8192
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

                // Handle each delta suggestion chunk for streaming JSON
                partialJSON += delta.suggestion

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
                  currentSuggestion += delta.suggestion

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
          await new Promise((resolve) => setTimeout(resolve, 400))

          const noteCount = streamingNotes.length
          for (let i = 0; i < noteCount; i++) {
            await new Promise((resolve) => setTimeout(resolve, 150)) // Delay between each note

            setStreamingNotes((prevNotes) => {
              const updatedNotes = [...prevNotes]
              if (updatedNotes[i]) {
                updatedNotes[i] = {
                  ...updatedNotes[i],
                  isScanComplete: true,
                }
              }
              return updatedNotes
            })
          }

          // Final animation complete - wait a moment before showing final notes
          await new Promise((resolve) => setTimeout(resolve, 500))

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
            const suggestionData: Suggestions = JSON.parse(suggestionString.trim())

            if (suggestionData.suggestions && Array.isArray(suggestionData.suggestions)) {
              generatedNotes = suggestionData.suggestions.map((suggestion, index) => ({
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
      } catch (error) {
        setNotesError("Notes not available, try again later")
        setReasoningComplete(true)
        setCurrentlyGeneratingDateKey(null)
        throw error
      }
    },
    [streamingNotes.length],
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
  const generateNewSuggestions = useCallback(
    async (steeringSettings: SteeringSettings) => {
      if (!currentFile || !vault || !markdownContent) return

      // Clear any previous current generation notes
      setCurrentGenerationNotes([])
      setNotesError(null)
      setIsNotesLoading(true)
      setStreamingReasoning("")
      setReasoningComplete(false)
      setStreamingSuggestionColors([])
      setScanAnimationComplete(false) // Reset scan animation state

      // Update the last notes generation time
      setLastNotesGeneratedTime(new Date())

      // Set a current date key for the new notes group with 15-second interval
      const now = new Date()
      const seconds = now.getSeconds()
      const interval = Math.floor(seconds / 15) * 15
      const dateKey = `${now.toDateString()}-${now.getHours()}-${now.getMinutes()}-${interval}`
      setCurrentlyGeneratingDateKey(dateKey)

      try {
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
            // Use preserved color or generate a new one
            color: streamingSuggestionColors[index] || generatePastelColor(),
            fileId: currentFile,
            vaultId: vault.id,
            isInEditor: false,
            createdAt: new Date(),
            lastModified: new Date(),
            reasoningId: reasoningId,
            // Add steering parameters if they exist
            authors: steeringSettings.authors,
            tonality: steeringSettings.tonalityEnabled ? steeringSettings.tonality : undefined,
            temperature: steeringSettings.temperature,
            numSuggestions: steeringSettings.numSuggestions,
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
          // Add steering parameters if they exist
          authors: steeringSettings.authors,
          tonality: steeringSettings.tonalityEnabled ? steeringSettings.tonality : undefined,
          temperature: steeringSettings.temperature,
          numSuggestions: steeringSettings.numSuggestions,
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
    },
    [currentFile, vault, markdownContent, fetchNewNotes, streamingSuggestionColors],
  )

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

        // If there are notes, set the last generation time to the most recent note's creation time
        if (sortedNotes.length > 0) {
          setLastNotesGeneratedTime(new Date(sortedNotes[0].createdAt))
        }

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
  }, [notes, currentGenerationNotes, droppedNotes, groupNotesByDate])

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
      if (!note) return

      // Update the note to indicate it's no longer dropped
      const undropNote = {
        ...note,
        dropped: false,
        lastModified: new Date(),
      }

      // Remove from droppedNotes state
      setDroppedNotes((prev) => prev.filter((n) => n.id !== noteId))

      // Update the database
      try {
        await db.notes.update(noteId, {
          dropped: false,
          lastModified: new Date(),
        })

        // Add back to main notes collection if not already there
        const existingNote = notes.find((n) => n.id === noteId)
        if (!existingNote) {
          // Add to the beginning of the notes array to make it appear at the top
          setNotes((prev) => [undropNote, ...prev])
        }
      } catch (error) {
        console.error("Failed to update note status:", error)
      }
    },
    [droppedNotes, notes],
  )

  return (
    <DndProvider backend={HTML5Backend}>
      <NotesProvider>
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
                  <EditorDropTarget handleNoteDropped={handleNoteDropped}>
                    <AnimatePresence>
                      {memoizedDroppedNotes.length > 0 && (
                        <DroppedNotesStack
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
                        onClick={toggleNotes}
                        disabled={isNotesLoading}
                        size="small"
                        title={showNotes ? "Hide Notes" : "Show Notes"}
                      >
                        <CopyIcon className="w-3 h-3" />
                      </VaultButton>
                    </div>
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
      </NotesProvider>
    </DndProvider>
  )
})
