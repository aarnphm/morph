import { cn } from "@/lib"
import { generatePastelColor } from "@/lib/notes"
import { ChevronDownIcon, ChevronUpIcon } from "@radix-ui/react-icons"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { AttachedNoteCard, DraggableNoteCard } from "@/components/note-card"
import { ReasoningPanel } from "@/components/reasoning-panel"

import { usePGlite } from "@/context/db"

import { Note } from "@/db/interfaces"
import * as schema from "@/db/schema"

interface DateDisplayProps {
  dateStr: string
  formatDate: (dateStr: string) => React.ReactNode
}

export const DateDisplay = memo(function DateDisplay({ dateStr, formatDate }: DateDisplayProps) {
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

export const NoteGroup = memo(
  function NoteGroup({
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
    const [isExpanded, setIsExpanded] = useState<boolean>(false)

    // Define staggered animation variants
    const containerVariants = {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: 0.07,
          delayChildren: 0.05,
        },
      },
      exit: {
        opacity: 0,
        transition: {
          staggerChildren: 0.03,
          staggerDirection: -1,
        },
      },
    }

    const itemVariants = {
      hidden: { opacity: 0, y: 15 },
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          type: "spring",
          stiffness: 350,
          damping: 30,
        },
      },
      exit: {
        opacity: 0,
        y: -10,
        transition: { duration: 0.2 },
      },
    }

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

    const MemoizedNotes = useMemo(() => {
      return dateNotes.map((note) => ({
        ...note,
        color: note.color ?? generatePastelColor(),
      }))
    }, [dateNotes])

    const MemoizedReasoningPanel = useMemo(() => {
      if (!reasoning) return null
      return (
        <ReasoningPanel
          reasoning={reasoning.content}
          isStreaming={false}
          isComplete={true}
          currentFile={currentFile}
          vaultId={vaultId}
          reasoningId={reasoning.id}
          shouldExpand={isExpanded}
          elapsedTime={reasoning.reasoningElapsedTime || 0}
          onExpandChange={setIsExpanded}
        />
      )
    }, [reasoning, currentFile, vaultId, isExpanded])

    return (
      <div className="mb-3">
        <div className="mb-2 space-y-4 bg-background">
          <DateDisplay dateStr={dateStr} formatDate={formatDate} />
          {MemoizedReasoningPanel}
        </div>

        <motion.div
          className="grid gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {MemoizedNotes.map((note) => (
            <motion.div key={note.id} variants={itemVariants}>
              <DraggableNoteCard
                note={note}
                handleNoteDropped={stableHandleNoteDropped}
                onNoteRemoved={stableOnNoteRemoved}
                isGenerating={isGenerating}
              />
            </motion.div>
          ))}
        </motion.div>
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

interface DroppedNoteGroupProps {
  droppedNotes: Note[]
  isStackExpanded: boolean
  onExpandStack: () => void
  onDragBackToPanel: (noteId: string) => void
  className?: string
}

export const DroppedNoteGroup = memo(
  function DroppedNoteGroup({
    droppedNotes,
    isStackExpanded,
    onExpandStack,
    onDragBackToPanel,
    className,
  }: DroppedNoteGroupProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const lastNoteRef = useRef<HTMLDivElement>(null)
    const prevNotesLengthRef = useRef(droppedNotes.length)
    const MAX_VISIBLE_NOTES = 5
    const hasMoreNotes = droppedNotes.length > MAX_VISIBLE_NOTES
    const hasNotes = droppedNotes.length > 0

    // Motion values for chevron drag
    const dragY = useMotionValue(0)
    const chevronScale = useTransform(
      dragY,
      isStackExpanded ? [0, 30] : [0, -30],
      isStackExpanded ? [1, 1.3] : [1, 1.3],
    )

    // Function to handle drag end
    const handleDragEnd = () => {
      const threshold = 15
      const currentY = dragY.get()

      // If expanded and dragged up beyond threshold, collapse
      if (isStackExpanded && currentY < -threshold) {
        onExpandStack()
      }
      // If collapsed and dragged down beyond threshold, expand
      else if (!isStackExpanded && currentY > threshold) {
        onExpandStack()
      }

      // Reset drag position
      dragY.set(0)
    }

    // Get database client
    const client = usePGlite()
    const db = useMemo(() => drizzle({ client, schema }), [client])

    // Get notes to display - either first 5 or all (limited to 20 for performance)
    const notesToDisplay = useMemo(
      () => (isStackExpanded ? droppedNotes : droppedNotes.slice(0, MAX_VISIBLE_NOTES)),
      [droppedNotes, isStackExpanded],
    )

    // Update the database when a note is reordered - use batching for efficiency
    const updateNotesInDB = useCallback(
      async (noteIds: string[]) => {
        try {
          if (noteIds.length === 0) return

          console.debug(`Batch updating ${noteIds.length} notes in database`)

          // Use Promise.all to batch all updates in parallel
          const now = new Date()
          const updatePromises = noteIds.map((noteId) =>
            db
              .update(schema.notes)
              .set({
                accessedAt: now, // Use the same timestamp for all updates
              })
              .where(eq(schema.notes.id, noteId)),
          )

          await Promise.all(updatePromises)
        } catch (error) {
          console.error("Failed to batch update notes in database:", error)
        }
      },
      [db],
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

        // Update the database to reflect the new note was viewed
        const lastNoteId = droppedNotes[droppedNotes.length - 1]?.id
        if (lastNoteId) {
          updateNotesInDB([lastNoteId])
        }
      }

      // Update the reference for next comparison
      prevNotesLengthRef.current = droppedNotes.length
    }, [droppedNotes.length, isStackExpanded, droppedNotes, updateNotesInDB])

    // When stack expansion state changes, update the database - but only once, not per note
    useEffect(() => {
      // If we expand the stack, update access time for all notes with a single batch operation
      if (isStackExpanded && droppedNotes.length > 0) {
        // Extract all note IDs for a single batch update
        const noteIds = droppedNotes.map((note) => note.id)

        // Use our batched update function
        updateNotesInDB(noteIds)
      }
    }, [isStackExpanded, droppedNotes, updateNotesInDB])

    // Render nothing if there are no notes
    if (!hasNotes) return null

    return (
      <motion.div
        ref={containerRef}
        className={cn(
          "absolute top-4 right-4 z-40",
          isStackExpanded && "bg-background/80 backdrop-blur-sm border rounded-md shadow-md p-2",
        )}
        key={`dropped-notes-${droppedNotes.length}`}
        initial={{ opacity: 0, scale: 0.95, y: 0 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 0 }}
      >
        <motion.div
          ref={scrollContainerRef}
          className={cn(
            "flex flex-col items-center gap-1.5",
            isStackExpanded && "max-h-[20vh] overflow-y-auto scrollbar-hidden",
          )}
          layout
        >
          <AnimatePresence mode="sync" initial={false}>
            {notesToDisplay.map((note, index) => (
              <div
                key={note.id}
                ref={index === notesToDisplay.length - 1 ? lastNoteRef : undefined}
              >
                <AttachedNoteCard
                  note={note}
                  index={index}
                  isStackExpanded={isStackExpanded}
                  onDragBackToPanel={onDragBackToPanel}
                  className={className}
                />
              </div>
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Chevron for drag interaction - separate from scrollable content */}
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{
            duration: 2,
            ease: "easeInOut",
            repeat: Infinity,
          }}
          className="flex justify-center mt-1"
        >
          {isStackExpanded ? (
            <motion.div
              className="text-primary/50 cursor-grab active:cursor-grabbing flex justify-center items-center py-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1 }}
              title="Drag up to collapse notes"
              drag="y"
              dragDirectionLock
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              style={{ y: dragY, scale: chevronScale }}
              onDragEnd={handleDragEnd}
            >
              <ChevronUpIcon className="w-4 h-4" />
            </motion.div>
          ) : (
            hasMoreNotes && (
              <motion.div
                key="more-notes-indicator"
                className="text-primary/50 cursor-grab active:cursor-grabbing flex justify-center items-center py-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                title="Drag down to expand notes"
                drag="y"
                dragDirectionLock
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.2}
                style={{ y: dragY, scale: chevronScale }}
                onDragEnd={handleDragEnd}
              >
                <ChevronDownIcon className="w-4 h-4" />
              </motion.div>
            )
          )}
        </motion.div>
      </motion.div>
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
