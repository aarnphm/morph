import * as React from "react"
import { useRef, useState, memo, useMemo, useEffect, useCallback } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { DragSourceMonitor, useDrag } from "react-dnd"
import { NOTES_DND_TYPE } from "@/lib/notes"
import { cn } from "@/lib/utils"
import type { Note } from "@/db"
import { getEmptyImage } from "react-dnd-html5-backend"
import { cva, type VariantProps } from "class-variance-authority"

// Define note card variants using CVA
const noteCardVariants = cva(
  [
    "p-4 border border-border transition-all",
    "shadow-md",
    "notecard-ragged relative",
    "before:content-[''] before:absolute before:inset-0 before:z-[-1]",
    "before:opacity-50 before:mix-blend-multiply before:bg-noise-pattern",
    "after:content-[''] after:absolute after:bottom-[-8px] after:right-[-8px]",
    "after:left-[8px] after:top-[8px] after:z-[-2]",
  ],
  {
    variants: {
      variant: {
        default: ["duration-200", "hover:shadow-lg hover:bg-gradient-to-br"],
        skeleton: ["cursor-default", "animate-shimmer", "rounded-sm", "w-full mb-4"],
      },
      size: {
        default: [],
        sm: ["scale-90"],
        lg: ["scale-110"],
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

// Define prop types using VariantProps
export type NoteCardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof noteCardVariants> & {
    note?: Note
    isGenerating?: boolean
    color?: string
  }

export const NoteCard = memo(function NoteCard({
  note,
  className,
  isGenerating = false,
  variant = "default",
  size,
  color,
  ...props
}: NoteCardProps) {
  const [isWiggling, setIsWiggling] = useState(false)

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
    if (!isGenerating && variant === "default") {
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

  // Render skeleton content if variant is skeleton
  const content =
    variant === "skeleton" ? (
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    ) : (
      <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{note?.content}</p>
    )

  return (
    <div
      style={{
        boxShadow: `${shadowOffset.x}px ${shadowOffset.y}px 8px rgba(0,0,0,0.15)`,
        backgroundImage: `
          radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px),
          radial-gradient(rgba(0,0,0,0.07) 1px, transparent 1px)
        `,
        backgroundSize: "20px 20px, 10px 10px",
        backgroundPosition: "-10px -10px, 0px 0px",
        transform: `rotate(${rotation}deg)`,
        zIndex: "auto",
        ...({
          "--base-rotation": `${rotation}deg`,
        } as React.CSSProperties),
      }}
      className={cn(
        noteCardVariants({ variant, size }),
        variant === "default" && "cursor-grab",
        variant === "default" && isGenerating && "animate-pulse",
        variant === "default" && isWiggling && !isGenerating && "animate-wiggle",
        note?.color || color,
        className,
      )}
      onMouseEnter={startWiggle}
      onMouseLeave={stopWiggle}
      onAnimationEnd={handleAnimationEnd}
      {...props}
    >
      {content}
    </div>
  )
})

interface DraggableNoteCardProps {
  note: Note
  handleNoteDropped: (note: Note) => void
  onNoteRemoved: (noteId: string) => void
  onCurrentGenerationNote?: (note: Note) => void
  isGenerating: boolean
}

export const DraggableNoteCard = memo(function DraggableNoteCard({
  note,
  handleNoteDropped,
  onNoteRemoved,
  onCurrentGenerationNote,
  isGenerating,
}: DraggableNoteCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [, connectDrag, preview] = useDrag(
    () => ({
      type: NOTES_DND_TYPE,
      // Use the ref to ensure the item reference remains stable during drag
      item: () => ({ ...note }),
      collect: (monitor: DragSourceMonitor) => ({
        isDragging: monitor.isDragging(),
      }),
      end: (item, monitor) => {
        // If not dropped or drop result is undefined, don't attempt any state updates
        if (!monitor.didDrop()) return

        try {
          const dropResult = monitor.getDropResult<{ targetId: string }>()
          if (!dropResult || !dropResult.targetId) return

          if (dropResult.targetId === "editor") {
            handleNoteDropped(item)
            onCurrentGenerationNote?.(item)
            onNoteRemoved(item.id)
          }
        } catch (error) {
          console.error("Error in drag end handler:", error)
        }
      },
    }),
    // Only depend on the note ID to prevent unnecessary recreations
    [note.id, handleNoteDropped, onNoteRemoved, onCurrentGenerationNote],
  )

  // Connect the drag source to our ref
  useEffect(() => {
    if (ref.current) {
      connectDrag(ref.current)
    }
  }, [connectDrag, ref])

  // Use empty image as drag preview (we'll use CustomDragLayer instead)
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true })
  }, [preview])

  return (
    <div ref={ref}>
      <NoteCard className="w-full" note={note} isGenerating={isGenerating} />
    </div>
  )
})
