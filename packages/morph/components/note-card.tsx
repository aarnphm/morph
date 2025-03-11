import * as React from "react"
import { useDrag } from "react-dnd"
import { NOTES_DND_TYPE, type Note } from "@/lib/notes"
import { cn } from "@/lib/utils"

interface NoteCardProps {
  note: Note
  className?: string
}

export const NoteCard = React.memo(function NoteCard({ note, className }: NoteCardProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: NOTES_DND_TYPE,
    item: note,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const dropResult = monitor.getDropResult<{ noteId: string; targetId: string }>();
      if (dropResult?.targetId === "editor") {
        // Note was successfully dropped in editor
      } else {
        // Return note to original position if dropped elsewhere
      }
    },
  }))

  return (
    <div
      ref={drag}
      className={cn(
        "p-4 border border-border rounded transition-all duration-200 hover:shadow-lg hover:bg-gradient-to-br shadow-sm",
        isDragging && "opacity-50",
        note.color,
        className,
      )}
    >
      <p className="text-sm line-clamp-3 leading-relaxed text-gray-800 dark:text-gray-200">{note.content}</p>
    </div>
  )
})
