import { cn } from "@/lib"
import { generatePastelColor } from "@/lib/notes"
import { NOTES_DND_TYPE } from "@/lib/notes"
import { Cross2Icon, MixerHorizontalIcon, ShadowInnerIcon } from "@radix-ui/react-icons"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDrop } from "react-dnd"
import { Components, Virtuoso } from "react-virtuoso"

import { DraggableNoteCard, NoteCard } from "@/components/note-card"
import { DateDisplay, NoteGroup } from "@/components/note-group"
import { ReasoningPanel } from "@/components/reasoning-panel"
import {
  AuthorsSelector,
  SuggestionsSlider,
  TemperatureSlider,
  TonalityRadar,
} from "@/components/steering-panel"
import { VaultButton } from "@/components/ui/button"

import { SteeringSettings, useSteeringContext } from "@/context/steering"

import type { Note } from "@/db/interfaces"

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
  isNotesRecentlyGenerated: boolean
  currentReasoningElapsedTime: number
  generateNewSuggestions: (steeringSettings: SteeringSettings) => void
  noteGroupsData: [string, Note[]][]
  notesContainerRef: React.RefObject<HTMLDivElement | null>
  streamingNotes?: StreamingNote[]
  scanAnimationComplete?: boolean
}

export interface StreamingNote {
  id: string
  content: string
  color: string
  isComplete: boolean
  isScanComplete?: boolean
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

// Create a memoized driver bar component for the notes panel
interface DriversBarProps {
  handleGenerateNewSuggestions: (steeringSettings: SteeringSettings) => void
  isNotesLoading: boolean
  isNotesRecentlyGenerated: boolean
}

const DriversBar = memo(
  function DriversBar({
    handleGenerateNewSuggestions,
    isNotesLoading,
    isNotesRecentlyGenerated,
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

    return (
      <div className="flex flex-col border-t bg-background/95 backdrop-blur-sm shadow-md z-10 relative">
        <AnimatePresence initial={false}>
          {isSteeringExpanded && (
            <motion.div
              key="steering-controls"
              initial={{ height: "auto", opacity: 1 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0 }}
              className="px-4 pb-2 overflow-hidden border-b border-border"
            >
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
                  <TemperatureSlider
                    value={settings.temperature}
                    onChange={handleUpdateTemperature}
                  />
                </div>

                <div>
                  <SuggestionsSlider
                    value={settings.numSuggestions}
                    onChange={handleUpdateNumSuggestions}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-end gap-3 p-2">
          <VaultButton
            onClick={toggleSteeringPanel}
            size="small"
            color="yellow"
            title="Interpreter Settings"
            disabled={isNotesLoading}
            className={cn(
              isNotesLoading && "cursor-not-allowed opacity-50 hover:cursor-not-allowed",
            )}
          >
            <MixerHorizontalIcon className="h-3 w-3" />
          </VaultButton>

          <VaultButton
            onClick={() => handleGenerateNewSuggestions(settings)}
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
      </div>
    )
  },
  // Include all props in equality check
  (prevProps, nextProps) =>
    prevProps.isNotesLoading === nextProps.isNotesLoading &&
    prevProps.isNotesRecentlyGenerated === nextProps.isNotesRecentlyGenerated &&
    prevProps.handleGenerateNewSuggestions === nextProps.handleGenerateNewSuggestions,
)

export const NotesPanel = memo(function NotesPanel({
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
  isNotesRecentlyGenerated,
  currentReasoningElapsedTime,
  generateNewSuggestions,
  noteGroupsData,
  notesContainerRef,
  streamingNotes,
  scanAnimationComplete,
}: NotesPanelProps) {
  const memoizedNoteSkeletons = useMemo(() => <NoteCard variant="skeleton" />, [])

  // Get steering settings and fileId update function from context
  const { settings, updateFileId } = useSteeringContext()

  // Track settings changes with a ref to detect actual value changes
  const prevSettingsRef = useRef(settings)
  const currentFileRef = useRef<string | null>(null)

  // Add effect to properly track settings changes
  useEffect(() => {
    if (JSON.stringify(prevSettingsRef.current) !== JSON.stringify(settings)) {
      prevSettingsRef.current = settings
    }
  }, [settings])

  // Add effect to update fileId in steering context when it changes
  useEffect(() => {
    // Skip for non-persisted files
    if (currentFile === "Untitled") {
      updateFileId(null)
      currentFileRef.current = null
      return
    }

    // Find the file ID from notes array
    if (notes.length > 0 && notes[0].fileId && currentFileRef.current !== notes[0].fileId) {
      currentFileRef.current = notes[0].fileId
      updateFileId(notes[0].fileId)
    }
  }, [currentFile, notes, updateFileId])

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
          <NoteGroup
            dateStr={dateStr}
            dateNotes={dateNotes}
            reasoning={dateReasoning}
            currentFile={currentFile}
            vaultId={vaultId}
            handleNoteDropped={handleNoteDropped}
            onNoteRemoved={handleNoteRemoved}
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
      <div className="flex-1 overflow-auto scrollbar-hidden px-2 pt-2 gap-4">
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
                      <div className="mb-2 space-y-4 bg-background">
                        <DateDisplay
                          dateStr={currentlyGeneratingDateKey!}
                        />

                        <ReasoningPanel
                          reasoning={streamingReasoning}
                          isStreaming={isNotesLoading && !reasoningComplete}
                          isComplete={reasoningComplete}
                          currentFile={currentFile}
                          vaultspace-y-4
                          px-2Id={vaultId}
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
                                  fileId: currentFile,
                                  vaultId: vaultId || "",
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
                <div className="flex-1 min-h-0">
                  <Virtuoso
                    key={`note-list-${currentFile}-${noteGroupsData.length}`}
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
        handleGenerateNewSuggestions={generateNewSuggestions}
        isNotesLoading={isNotesLoading}
        isNotesRecentlyGenerated={isNotesRecentlyGenerated}
      />
    </div>
  )
})
