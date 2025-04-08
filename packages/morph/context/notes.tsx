import { generatePastelColor } from "@/lib/notes"
import { submitNoteForEmbedding } from "@/services/notes"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import React, { createContext, useCallback, useContext, useEffect, useReducer } from "react"

import { usePGlite } from "@/context/db"
import { useEmbeddingTasks } from "@/context/embedding"

import type { Note, ReasoningHistory, StreamingNote } from "@/db/interfaces"
import * as schema from "@/db/schema"

// Define the action types for the notes reducer
export type NotesAction =
  | { type: "SET_NOTES"; notes: Note[] }
  | { type: "ADD_NOTES"; notes: Note[] }
  | { type: "REMOVE_NOTE"; noteId: string }
  | { type: "SET_DROPPED_NOTES"; droppedNotes: Note[] }
  | { type: "ADD_DROPPED_NOTE"; note: Note }
  | { type: "REMOVE_DROPPED_NOTE"; noteId: string }
  | { type: "CLEAR_NOTES" }
  | { type: "SET_CURRENT_FILE_ID"; fileId: string | null }
  | { type: "SET_CURRENT_VAULT_ID"; vaultId: string | null }
  | { type: "SET_REASONING_HISTORY"; reasoningHistory: ReasoningHistory[] }
  | { type: "ADD_REASONING_HISTORY"; reasoning: ReasoningHistory }
  | { type: "SET_CURRENT_REASONING_ID"; reasoningId: string }
  | { type: "SET_CURRENT_GENERATING_DATE_KEY"; dateKey: string | null }
  | { type: "SET_STREAMING_NOTES"; streamingNotes: StreamingNote[] }
  | { type: "SET_STREAMING_REASONING"; reasoning: string }
  | { type: "SET_CURRENT_GENERATION_NOTES"; notes: Note[] }
  | { type: "SET_REASONING_COMPLETE"; complete: boolean }
  | { type: "SET_SCAN_ANIMATION_COMPLETE"; complete: boolean }
  | { type: "SET_IS_NOTES_LOADING"; loading: boolean }
  | { type: "SET_NOTES_ERROR"; error: string | null }
  | { type: "SET_LAST_NOTES_GENERATED_TIME"; time: Date | null }
  | { type: "SET_DB_FILE"; dbFile: typeof schema.files.$inferSelect | null }
  | { type: "FORCE_REFRESH" }

// Define the state interface for the notes reducer
export interface NotesState {
  notes: Note[]
  droppedNotes: Note[]
  currentFileId: string | null
  currentVaultId: string | null
  reasoningHistory: ReasoningHistory[]
  currentlyGeneratingDateKey: string | null
  streamingNotes: StreamingNote[]
  streamingReasoning: string
  currentGenerationNotes: Note[]
  currentReasoningId: string
  reasoningComplete: boolean
  scanAnimationComplete: boolean
  isNotesLoading: boolean
  notesError: string | null
  lastNotesGeneratedTime: Date | null
  dbFile: typeof schema.files.$inferSelect | null
}

// Initial state for the reducer
export const initialNotesState: NotesState = {
  notes: [],
  droppedNotes: [],
  currentFileId: null,
  currentVaultId: null,
  reasoningHistory: [],
  currentlyGeneratingDateKey: null,
  streamingNotes: [],
  streamingReasoning: "",
  currentGenerationNotes: [],
  currentReasoningId: "",
  reasoningComplete: false,
  scanAnimationComplete: false,
  isNotesLoading: false,
  notesError: null,
  lastNotesGeneratedTime: null,
  dbFile: null,
}

// Define the notes reducer function
export function notesReducer(state: NotesState, action: NotesAction): NotesState {
  switch (action.type) {
    case "SET_NOTES":
      return {
        ...state,
        notes: action.notes,
      }
    case "ADD_NOTES":
      // Avoid duplicates by checking IDs
      const newNotes = action.notes.filter(
        (note) => !state.notes.some((existingNote) => existingNote.id === note.id),
      )
      return {
        ...state,
        notes: [...newNotes, ...state.notes].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      }
    case "REMOVE_NOTE":
      return {
        ...state,
        notes: state.notes.filter((note) => note.id !== action.noteId),
      }
    case "SET_DROPPED_NOTES":
      return {
        ...state,
        droppedNotes: action.droppedNotes,
      }
    case "ADD_DROPPED_NOTE":
      // Avoid duplicates
      if (state.droppedNotes.some((note) => note.id === action.note.id)) {
        return state
      }
      return {
        ...state,
        droppedNotes: [...state.droppedNotes, action.note],
      }
    case "REMOVE_DROPPED_NOTE":
      return {
        ...state,
        droppedNotes: state.droppedNotes.filter((note) => note.id !== action.noteId),
      }
    case "CLEAR_NOTES":
      return {
        ...state,
        notes: [],
        droppedNotes: [],
        reasoningHistory: [],
        currentlyGeneratingDateKey: null,
        streamingNotes: [],
        streamingReasoning: "",
        currentGenerationNotes: [],
        currentReasoningId: "",
        reasoningComplete: false,
        scanAnimationComplete: false,
        isNotesLoading: false,
        notesError: null,
      }
    case "SET_CURRENT_FILE_ID":
      return {
        ...state,
        currentFileId: action.fileId,
      }
    case "SET_CURRENT_REASONING_ID":
      return {
        ...state,
        currentReasoningId: action.reasoningId,
      }
    case "SET_CURRENT_VAULT_ID":
      return {
        ...state,
        currentVaultId: action.vaultId,
      }
    case "SET_REASONING_HISTORY":
      return {
        ...state,
        reasoningHistory: action.reasoningHistory,
      }
    case "ADD_REASONING_HISTORY":
      return {
        ...state,
        reasoningHistory: [...state.reasoningHistory, action.reasoning],
      }
    case "SET_CURRENT_GENERATING_DATE_KEY":
      return {
        ...state,
        currentlyGeneratingDateKey: action.dateKey,
      }
    case "SET_STREAMING_NOTES":
      return {
        ...state,
        streamingNotes: action.streamingNotes,
      }
    case "SET_STREAMING_REASONING":
      return {
        ...state,
        streamingReasoning: action.reasoning,
      }
    case "SET_CURRENT_GENERATION_NOTES":
      return {
        ...state,
        currentGenerationNotes: action.notes,
      }
    case "SET_REASONING_COMPLETE":
      return {
        ...state,
        reasoningComplete: action.complete,
      }
    case "SET_SCAN_ANIMATION_COMPLETE":
      return {
        ...state,
        scanAnimationComplete: action.complete,
      }
    case "SET_IS_NOTES_LOADING":
      return {
        ...state,
        isNotesLoading: action.loading,
      }
    case "SET_NOTES_ERROR":
      return {
        ...state,
        notesError: action.error,
      }
    case "SET_LAST_NOTES_GENERATED_TIME":
      return {
        ...state,
        lastNotesGeneratedTime: action.time,
      }
    case "SET_DB_FILE":
      return {
        ...state,
        dbFile: action.dbFile,
      }
    default:
      return state
  }
}

// Create the context
interface NotesContextType {
  state: NotesState
  dispatch: React.Dispatch<NotesAction>
  handleNoteDropped: (note: Note) => Promise<void>
  handleNoteRemoved: (noteId: string) => void
  loadFileMetadata: (fileId: string) => Promise<void>
  updateDbFile: (fileId: string | null) => Promise<typeof schema.files.$inferSelect | null>
}

const NotesContext = createContext<NotesContextType | undefined>(undefined)

// Create the provider component
export function NotesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(notesReducer, initialNotesState)
  const client = usePGlite()
  const db = drizzle({ client, schema })
  const { addTask } = useEmbeddingTasks()

  // Helper function to update the database file information
  const updateDbFile = useCallback(
    async (fileId: string | null) => {
      if (!fileId || !state.currentVaultId) {
        dispatch({ type: "SET_DB_FILE", dbFile: null })
        return null
      }

      try {
        const file = await db.query.files.findFirst({
          where: (files, { and, eq }) =>
            and(eq(files.id, fileId), eq(files.vaultId, state.currentVaultId!)),
        })

        dispatch({ type: "SET_DB_FILE", dbFile: file || null })
        return file || null
      } catch (error) {
        console.error("Error fetching file from database:", error)
        return null
      }
    },
    [db, state.currentVaultId],
  )

  // Load file metadata (notes and reasoning history)
  const loadFileMetadata = useCallback(
    async (fileId: string) => {
      if (!state.currentVaultId) return
      console.debug(`[Notes Debug] Starting to load metadata for file ${fileId}`)

      try {
        // First get or update the DB file
        const dbFile = state.dbFile || (await updateDbFile(fileId))
        if (!dbFile) return

        try {
          // Query all notes for this file
          const fileNotes = await db
            .select()
            .from(schema.notes)
            .where(
              and(
                eq(schema.notes.fileId, dbFile.id),
                eq(schema.notes.vaultId, state.currentVaultId),
              ),
            )

          console.debug(
            `[Notes Debug] Retrieved ${fileNotes?.length || 0} notes from DB for file ${fileId}`,
          )

          if (fileNotes && fileNotes.length > 0) {
            // Separate notes into regular and dropped notes
            const regularNotes = fileNotes.filter((note) => !note.dropped)
            const droppedNotesList = fileNotes.filter((note) => note.dropped)

            console.debug(
              `[Notes Debug] Regular notes: ${regularNotes.length}, Dropped notes: ${droppedNotesList.length}`,
            )

            // Prepare notes for the UI
            const uiReadyRegularNotes = regularNotes.map((note) => ({
              ...note,
              color: note.color || generatePastelColor(),
              lastModified: new Date(note.accessedAt),
            }))

            const uiReadyDroppedNotes = droppedNotesList.map((note) => ({
              ...note,
              color: note.color || generatePastelColor(),
              lastModified: new Date(note.accessedAt),
            }))

            // Update state with the notes
            dispatch({ type: "SET_NOTES", notes: uiReadyRegularNotes })
            dispatch({ type: "SET_DROPPED_NOTES", droppedNotes: uiReadyDroppedNotes })

            // Load reasoning history for this file
            const reasoningRecords = await db.query.reasonings.findMany({
              where: (reasoning, { and, eq }) =>
                and(eq(reasoning.fileId, dbFile.id), eq(reasoning.vaultId, state.currentVaultId!)),
            })

            if (reasoningRecords && reasoningRecords.length > 0) {
              const formattedReasoningHistory: ReasoningHistory[] = reasoningRecords.map(
                (record) => ({
                  id: record.id,
                  content: record.content,
                  timestamp: record.createdAt,
                  noteIds: record.noteIds as string[],
                  reasoningElapsedTime: record.duration,
                  authors: record.steering?.authors,
                  tonality: record.steering?.tonality,
                  temperature: record.steering?.temperature,
                  numSuggestions: record.steering?.numSuggestions,
                }),
              )

              dispatch({
                type: "SET_REASONING_HISTORY",
                reasoningHistory: formattedReasoningHistory,
              })
            }
          }
        } catch (error) {
          console.error("Error fetching notes for file:", error)
        }
      } catch (dbError) {
        console.error("Error with database operations:", dbError)
      }
    },
    [db, state.currentVaultId, state.dbFile, updateDbFile],
  )

  // Handle note being dropped (moved to the dropped notes stack)
  const handleNoteDropped = useCallback(
    async (note: Note) => {
      if (!state.currentFileId || !state.currentVaultId) return
      console.debug(`[NotesContext] Handling note drop for note ${note.id}`)

      // Ensure note has a color if it doesn't already
      const droppedNote: Note = {
        ...note,
        dropped: true,
        accessedAt: new Date(),
      }

      // Update droppedNotes optimistically
      dispatch({ type: "ADD_DROPPED_NOTE", note: droppedNote })

      // Find the file in the database to get its ID
      try {
        // First, find the file in the database
        const dbFile = state.dbFile || (await updateDbFile(state.currentFileId))

        if (!dbFile) {
          console.error("Failed to find file in database when dropping note")
          return
        }

        console.debug(`[Notes Debug] Updating note ${note.id} in DB to mark as dropped`)

        // Save to database - update the note's dropped flag
        await db
          .update(schema.notes)
          .set({
            dropped: true,
            accessedAt: droppedNote.accessedAt!,
            ...(droppedNote.embeddingStatus !== "success" && { embeddingStatus: "in_progress" }),
          })
          .where(eq(schema.notes.id, droppedNote.id))

        console.debug(`[Notes Debug] Successfully updated note ${note.id} as dropped in DB`)
      } catch (error) {
        console.error("Failed to update note dropped status:", error)
      }
    },
    [db, state.currentFileId, state.currentVaultId, state.dbFile, updateDbFile],
  )

  // Handle note being removed
  const handleNoteRemoved = useCallback((noteId: string) => {
    dispatch({ type: "REMOVE_NOTE", noteId })
  }, [])

  // Set current file and vault IDs, and clear notes when they change
  useEffect(() => {
    if (!state.currentFileId || !state.currentVaultId) {
      // Clear notes when file/vault is unset
      if (state.notes.length > 0 || state.droppedNotes.length > 0) {
        dispatch({ type: "CLEAR_NOTES" })
      }
    }
  }, [state.currentFileId, state.currentVaultId, state.notes.length, state.droppedNotes.length])

  // Process any notes with in_progress embedding status when the component mounts
  useEffect(() => {
    const processInProgressEmbeddings = async () => {
      try {
        const notesNeedingEmbedding = await db.query.notes.findMany({
          where: eq(schema.notes.embeddingStatus, "in_progress"),
        })

        if (notesNeedingEmbedding.length > 0) {
          console.debug(
            `[Notes Debug] Found ${notesNeedingEmbedding.length} notes needing embedding`,
          )

          for (const note of notesNeedingEmbedding) {
            const result = await submitNoteForEmbedding(db, note)

            if (result && note.embeddingTaskId) {
              addTask(note.embeddingTaskId)
            }
          }
        }
      } catch (error) {
        console.error("Error processing in-progress embeddings:", error)
      }
    }

    processInProgressEmbeddings()
  }, [db, addTask])

  return (
    <NotesContext.Provider
      value={{
        state,
        dispatch,
        handleNoteDropped,
        handleNoteRemoved,
        loadFileMetadata,
        updateDbFile,
      }}
    >
      {children}
    </NotesContext.Provider>
  )
}

// Create a custom hook to use the notes context
export function useNotesContext() {
  const context = useContext(NotesContext)
  if (context === undefined) {
    throw new Error("useNotesContext must be used within a NotesProvider")
  }
  return context
}

// Helper type for note interfaces
export interface NotesInterface {
  Note: typeof schema.notes.$inferSelect
  StreamingNote: StreamingNote
  ReasoningHistory: ReasoningHistory
}
