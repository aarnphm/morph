import React, { useRef } from "react"
import { useDrop, useDragLayer } from "react-dnd"
import { NOTES_DND_TYPE } from "@/lib/notes"
import { useNotes } from "@/context/notes-context"
import { NoteCard } from "@/components/note-card"
import type { Note } from "@/db"

export function SuggestionNotes() {
  const { editorNotes, moveNoteToEditor } = useNotes()
  const containerRef = useRef<HTMLDivElement>(null)

  const [{ isOver }, drop] = useDrop({
    accept: NOTES_DND_TYPE,
    drop: (item: Note, monitor) => {
      if (!containerRef.current) return
      const clientOffset = monitor.getClientOffset()
      if (!clientOffset) return
      const boundingRect = containerRef.current.getBoundingClientRect()
      const position = {
        x: clientOffset.x - boundingRect.left,
        y: clientOffset.y - boundingRect.top,
      }

      moveNoteToEditor(item.id, position)

      console.log("Note dropped at position:", position, "with id:", item.id)

      return { noteId: item.id, targetId: "editor" }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  })

  const { isDragging } = useDragLayer((monitor) => ({
    isDragging: monitor.isDragging(),
  }))

  drop(containerRef)

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        pointerEvents: isDragging ? "auto" : "none",
      }}
      className={isOver ? "border-2 border-blue-500/20" : ""}
    >
      {editorNotes.map((note) => (
        <div
          key={note.id}
          style={{
            position: "absolute",
            top: note.position?.y ?? 0,
            left: note.position?.x ?? 0,
          }}
        >
          <NoteCard note={note} className="w-48" />
        </div>
      ))}
    </div>
  )
}
