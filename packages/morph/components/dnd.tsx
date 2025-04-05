import { cn } from "@/lib"
import { NOTES_DND_TYPE } from "@/lib/notes"
import { memo, useCallback, useEffect, useRef } from "react"
import { useDragLayer, useDrop } from "react-dnd"

import type { Note } from "@/db/interfaces"

export const CustomDragLayer = memo(function CustomDragLayer() {
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

interface EditorDropTargetProps {
  children: React.ReactNode
  handleNoteDropped: (note: Note) => void
}

export const EditorDropTarget = memo(function EditorDropTarget({
  children,
  handleNoteDropped,
}: EditorDropTargetProps) {
  // Save the handleNoteDropped reference in a ref to avoid dependency changes
  const handleDroppedRef = useRef(handleNoteDropped)
  useEffect(() => {
    handleDroppedRef.current = handleNoteDropped
  }, [handleNoteDropped])

  const onDropped = useCallback((item: Note) => {
    handleDroppedRef.current?.(item)
  }, [])

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
        "flex flex-1 relative transition-all duration-300 ease-in-out",
        isOver && "border-teal-300 border rounded-s-md rounded-w-md",
      )}
    >
      {children}
    </div>
  )
})
