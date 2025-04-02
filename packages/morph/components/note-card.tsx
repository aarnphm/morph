import type { Note } from "@/db"
import { NOTES_DND_TYPE, generatePastelColor } from "@/lib/notes"
import { cn } from "@/lib/utils"
import { type VariantProps, cva } from "class-variance-authority"
import { motion } from "motion/react"
import * as React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DragSourceMonitor, useDrag } from "react-dnd"
import { getEmptyImage } from "react-dnd-html5-backend"

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Skeleton } from "@/components/ui/skeleton"

// Define note card variants using CVA
const noteCardVariants = cva(
  [
    "p-4 border border-border transition-all shadow-md relative notecard-ragged",
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
    isStreaming?: boolean
    isScanComplete?: boolean
  }

export const NoteCard = memo(function NoteCard({
  note,
  className,
  isGenerating = false,
  variant = "default",
  size,
  color,
  isStreaming = false,
  isScanComplete = false,
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

  // Use a debounced wiggle effect to prevent jittering
  const startWiggle = useCallback(() => {
    if (!isGenerating && variant === "default" && !isWiggling) {
      setIsWiggling(true)
    }
  }, [isGenerating, variant, isWiggling])

  const stopWiggle = useCallback(() => {
    setIsWiggling(false)
  }, [])

  // Reset wiggle animation when it completes
  const handleAnimationEnd = useCallback(() => {
    setIsWiggling(false)
  }, [])

  // Render skeleton content if variant is skeleton
  const content =
    variant === "skeleton" ? (
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    ) : (
      <div className="relative">
        <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          {note?.content}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-2 w-0.5 animate-cursor-blink bg-gray-800 dark:bg-gray-200 opacity-70"></span>
          )}
        </p>
        {isStreaming && (
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent to-accent/10 dark:to-accent/5 animate-text-shimmer"></div>
        )}
        {isScanComplete && (
          <div className="absolute inset-0 pointer-events-none bg-accent/5 dark:bg-accent/10 animate-scan-down"></div>
        )}
      </div>
    )

  const cardStyle = useMemo(
    () => ({
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
    }),
    [rotation, shadowOffset.x, shadowOffset.y],
  )

  return (
    <div
      style={cardStyle}
      className={cn(
        noteCardVariants({ variant, size }),
        variant === "default" && "cursor-grab",
        variant === "default" &&
          isWiggling &&
          !isGenerating &&
          "animate-wiggle will-change-transform",
        isStreaming && "overflow-hidden animate-text-shimmer",
        isScanComplete && "transition-all duration-500 ease-out shadow-lg",
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
  const [, drag, preview] = useDrag(
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

  const connectDragRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        drag(element)
      }
    },
    [drag],
  )

  // Use empty image as drag preview (we'll use CustomDragLayer instead)
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true })
  }, [preview])

  return (
    <div ref={connectDragRef}>
      <NoteCard className="w-full" note={note} isGenerating={isGenerating} />
    </div>
  )
})

interface AttachedNoteCardProps extends React.ComponentProps<typeof motion.div> {
  note: Note
  index: number
  isStackExpanded: boolean
  onDragBackToPanel?: (noteId: string) => void
}

export const AttachedNoteCard = memo(function AttachedNoteCard({
  note,
  index,
  isStackExpanded,
  onDragBackToPanel,
  className,
  ...props
}: AttachedNoteCardProps) {
  const noteRef = useRef<HTMLDivElement>(null)
  const constraintsRef = useRef<HTMLDivElement>(null)

  // Set up drag functionality similar to DraggableNoteCard but with constraints
  const [, drag, preview] = useDrag(
    () => ({
      type: NOTES_DND_TYPE,
      item: () => ({ ...note }),
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      end: (item, monitor) => {
        // If not dropped or drop result is undefined, don't attempt any state updates
        if (!monitor.didDrop()) return

        try {
          const dropResult = monitor.getDropResult<{ targetId: string }>()
          if (!dropResult || !dropResult.targetId) return

          // If drag position is beyond threshold, trigger "return to panel"
          if (dropResult.targetId === "notes-panel") {
            onDragBackToPanel?.(item.id)
          }
        } catch (error) {
          console.error("Error in drag end handler:", error)
        }
      },
    }),
    [note.id, onDragBackToPanel],
  )

  // Connect drag ref to the motion.div
  const connectDragRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        noteRef.current = element
        drag(element)
      }
    },
    [drag],
  )

  // Use empty image as drag preview (we'll use CustomDragLayer instead)
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true })
  }, [preview])

  // Animation variants for the note card in vertical stack - optimized for performance
  const variants = useMemo(
    () => ({
      collapsed: {
        opacity: 1,
        y: 0,
        scale: 1,
        zIndex: 100,
        transition: {
          type: "spring",
          stiffness: 350,
          damping: 25,
          mass: 0.5,
        },
      },
      expanded: {
        opacity: 1,
        y: 0,
        scale: 1,
        zIndex: 100,
        transition: {
          type: "spring",
          stiffness: 280,
          damping: 28,
          mass: 0.65,
        },
      },
      hidden: {
        opacity: 0,
        y: 0,
        scale: 1,
        transition: {
          duration: 0.2,
        },
      },
      // Add file transition animation variants
      fileEnter: {
        opacity: 0,
        y: 20,
        scale: 0.9,
      },
      fileVisible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          type: "spring",
          stiffness: 300,
          damping: 25,
          mass: 0.5,
          delay: index * 0.05, // Staggered animation based on index
        },
      },
      fileExit: {
        opacity: 0,
        y: 0,
        scale: 0.9,
      },
    }),
    [index],
  )

  // Ensure we have a color
  const noteColor = note.color || generatePastelColor()

  return (
    <div ref={constraintsRef} className="relative">
      <HoverCard key={note.id} openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <motion.div
            ref={connectDragRef}
            className={cn(
              `shadow-md w-6 h-6 rounded-md cursor-grab mb-1 will-change-transform`,
              className,
              noteColor,
            )}
            variants={variants}
            initial="fileEnter"
            animate={isStackExpanded ? "expanded" : "collapsed"}
            exit="fileExit"
            layout="position"
            drag="x"
            layoutDependency={isStackExpanded}
            dragDirectionLock
            dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
            dragTransition={{
              bounceStiffness: 450,
              bounceDamping: 20,
              power: 0.2,
              timeConstant: 0.15,
            }}
            dragElastic={0.1}
            whileDrag={{
              cursor: "grabbing",
              zIndex: 50,
              transition: {
                type: "tween",
                ease: "easeOut",
                duration: 0.1,
              },
            }}
            {...props}
          >
            <div className="relative z-10 text-sm p-1 flex items-center justify-center w-full h-full">
              {index + 1}
            </div>
          </motion.div>
        </HoverCardTrigger>
        <HoverCardContent
          side="left"
          sideOffset={6}
          className="w-64 bg-transparent border-0 shadow-none z-100"
        >
          <NoteCard note={note} className="z-auto" />
        </HoverCardContent>
      </HoverCard>
    </div>
  )
})
