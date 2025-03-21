import { createId } from "@paralleldrive/cuid2"
import { db, type Note } from "@/db"

export class NotesService {
  async getNotesByFile(fileId: string): Promise<Note[]> {
    return db.notes.where("fileId").equals(fileId).toArray()
  }

  async saveNote(note: Note): Promise<void> {
    await db.notes.put({
      ...note,
      id: note.id || createId(),
      lastModified: new Date(),
    })
  }

  async updateNoteStatus(noteId: string, isInEditor: boolean): Promise<void> {
    await db.notes
      .where("id")
      .equals(noteId)
      .modify((note) => {
        note.isInEditor = isInEditor
        note.lastModified = new Date()
      })
  }

  async shouldGenerateNotes(fileId: string, content: string): Promise<boolean> {
    const count = await db.notes.where("fileId").equals(fileId).count()
    return count === 0 && content.length > 1000
  }
}

export const notesService = new NotesService()
