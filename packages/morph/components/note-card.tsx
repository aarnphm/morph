import * as React from "react"
import { useRef, useState, memo, useMemo } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useDrag } from "react-dnd"
import { NOTES_DND_TYPE } from "@/lib/notes"
import { cn } from "@/lib/utils"
import type { Note } from "@/db"

interface NoteCardProps {
  note: Note
  className?: string
  isGenerating?: boolean
}

export const NoteCard = memo(function NoteCard({
  note,
  className,
  isGenerating = false,
}: NoteCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isWiggling, setIsWiggling] = useState(false)

  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: NOTES_DND_TYPE,
    item: note,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (_, monitor) => {
      const dropResult = monitor.getDropResult<{ noteId: string; targetId: string }>()
      if (dropResult?.targetId === "editor") {
        // Note was successfully dropped in editor
      } else {
        // Return note to original position if dropped elsewhere
      }
    },
  }))

  // Apply the drag ref to our element using callback ref pattern
  const setRefs = (element: HTMLDivElement | null) => {
    // Set our local ref
    if (ref.current !== element) {
      ref.current = element
    }
    // Apply the drag ref
    dragRef(element)
  }

  // Generate random rotation between -2.5 and 2.5 degrees for a more natural look
  const rotation = useMemo(() => Math.random() * 5 - 2.5, [])

  // Generate random shadow offset for 3D effect
  const shadowOffset = useMemo(() => {
    const x = Math.floor(Math.random() * 3) + 2
    const y = Math.floor(Math.random() * 3) + 2
    return { x, y }
  }, [])

  // Handle wiggle animation on hover
  const startWiggle = () => {
    if (!isDragging && !isGenerating) {
      setIsWiggling(true)
    }
  }

  const stopWiggle = () => {
    setIsWiggling(false)
  }

  // Reset wiggle animation when it completes
  const handleAnimationEnd = () => {
    setIsWiggling(false)
  }

  return (
    <div
      ref={setRefs}
      style={{
        boxShadow: isDragging
          ? `0 10px 20px rgba(0,0,0,0.25), 0 8px 8px rgba(0,0,0,0.2)`
          : `${shadowOffset.x}px ${shadowOffset.y}px 8px rgba(0,0,0,0.15)`,
        backgroundImage: `
          radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px),
          radial-gradient(rgba(0,0,0,0.07) 1px, transparent 1px)
        `,
        backgroundSize: "20px 20px, 10px 10px",
        backgroundPosition: "-10px -10px, 0px 0px",
        transform: isDragging ? `rotate(${rotation}deg) scale(1.02)` : `rotate(${rotation}deg)`,
        zIndex: isDragging ? 50 : "auto",
        ...({
          "--base-rotation": `${rotation}deg`,
        } as React.CSSProperties),
      }}
      className={cn(
        "p-4 border border-border transition-all duration-200",
        "hover:shadow-lg hover:bg-gradient-to-br shadow-md",
        isDragging &&
          "opacity-85 cursor-grabbing ring-2 ring-blue-200 dark:ring-blue-800 dragging-card",
        !isDragging && "cursor-grab",
        isGenerating && "animate-pulse",
        isWiggling && !isGenerating && "animate-wiggle",
        note.color,
        className,
        "notecard-ragged relative rounded-sm",
        "before:content-[''] before:absolute before:inset-0 before:z-[-1]",
        "before:opacity-50 before:mix-blend-multiply before:bg-noise-pattern",
        "after:content-[''] after:absolute after:bottom-[-8px] after:right-[-8px]",
        "after:left-[8px] after:top-[8px] after:z-[-2] after:bg-black/10",
      )}
      onMouseEnter={startWiggle}
      onMouseLeave={stopWiggle}
      onAnimationEnd={handleAnimationEnd}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-black/5 -z-10 rounded-sm transform translate-x-2 translate-y-2" />
      )}

      <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{note.content}</p>
    </div>
  )
})

export const DraggableNoteCard = memo(function DraggableNoteCard({
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
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: NOTES_DND_TYPE,
      item: note,
      end: (item, monitor) => {
        const dropResult = monitor.getDropResult<{ noteId: string; targetId: string }>()
        if (dropResult) {
          // Only remove from current view if not already dropped
          if (!note.dropped) {
            onNoteRemoved(noteId)
            onCurrentGenerationNote?.(note)
          }
          // Always handle the drop to update DB and UI state
          handleNoteDropped(note)
        }
      },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [noteId, note, onNoteRemoved, handleNoteDropped, onCurrentGenerationNote],
  )

  // Apply the drag ref to our element
  drag(cardRef)

  return (
    <div ref={cardRef} className={isDragging ? "opacity-50" : ""}>
      <NoteCard className="w-full" note={note} isGenerating={isGenerating} />
    </div>
  )
})

export const NoteCardSkeleton = memo(function NoteCardSkeleton({
  color = "bg-muted/10",
  className,
}: {
  color?: string
  className?: string
}) {
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
        className,
      )}
    >
      {skeletons}
    </div>
  )
})
