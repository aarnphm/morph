import * as React from "react"
import { createId } from "@paralleldrive/cuid2"
import { type Note } from "@/db"
import { db } from "@/db"
import { generatePastelColor } from "@/lib/notes"

interface NotesContextType {
  notes: Note[]
  editorNotes: Note[]
  addNote: (content: string, fileId: string, vaultId: string) => Promise<void>
  moveNoteToEditor: (noteId: string, position: { x: number; y: number }) => Promise<void>
  removeNoteFromEditor: (noteId: string) => Promise<void>
}

const NotesContext = React.createContext<NotesContextType | null>(null)

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const [notes, setNotes] = React.useState<Note[]>([])

  const editorNotes = notes.filter((note) => note.isInEditor)

  const addNote = React.useCallback(async (content: string, fileId: string, vaultId: string) => {
    const note: Note = {
      id: createId(),
      content,
      color: generatePastelColor(),
      fileId,
      vaultId,
      isInEditor: false,
      createdAt: new Date(),
      lastModified: new Date(),
    }

    await db.notes.add(note)
    setNotes((prev) => [...prev, note])
  }, [])

  const moveNoteToEditor = React.useCallback(
    async (noteId: string, position: { x: number; y: number }) => {
      await db.notes.update(noteId, {
        isInEditor: true,
        position,
        lastModified: new Date(),
      })
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, isInEditor: true, position } : n)),
      )
    },
    [],
  )

  const removeNoteFromEditor = React.useCallback(async (noteId: string) => {
    await db.notes
      .where("id")
      .equals(noteId)
      .modify((note) => {
        note.isInEditor = false
        note.lastModified = new Date()
      })
    setNotes((prev) =>
      prev.map((note) => (note.id === noteId ? { ...note, isInEditor: false } : note)),
    )
  }, [])

  const loadNotes = React.useCallback(async (fileId: string) => {
    const loadedNotes = await db.notes.where("fileId").equals(fileId).toArray()
    setNotes(loadedNotes)
  }, [])

  const value = React.useMemo(
    () => ({
      notes,
      editorNotes,
      addNote,
      moveNoteToEditor,
      removeNoteFromEditor,
      loadNotes,
    }),
    [notes, editorNotes, addNote, moveNoteToEditor, removeNoteFromEditor, loadNotes],
  )

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotes() {
  const context = React.useContext(NotesContext)
  if (!context) {
    throw new Error("useNotes must be used within a NotesProvider")
  }
  return context
}
