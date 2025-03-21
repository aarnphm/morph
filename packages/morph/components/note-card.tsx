import * as React from "react"
import { useRef } from "react"
import { useDrag } from "react-dnd"
import { NOTES_DND_TYPE, type Note } from "@/lib/notes"
import { cn } from "@/lib/utils"

interface NoteCardProps {
  note: Note
  className?: string
  isGenerating?: boolean
}

export const NoteCard = React.memo(function NoteCard({
  note,
  className,
  isGenerating = false,
}: NoteCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: NOTES_DND_TYPE,
    item: note,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
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

  return (
    <div
      ref={setRefs}
      className={cn(
        "p-4 border border-border rounded transition-all duration-200 hover:shadow-lg hover:bg-gradient-to-br shadow-sm",
        isDragging && "opacity-50",
        isGenerating && "animate-pulse",
        note.color,
        className,
      )}
    >
      <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{note.content}</p>
    </div>
  )
})
