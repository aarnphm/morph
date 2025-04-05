import { safeDate } from "@/lib"
import { API_ENDPOINT, POLLING_INTERVAL } from "@/services/constants"
import { TaskStatusResponse } from "@/services/constants"
import { useMutation, useQuery } from "@tanstack/react-query"
import axios from "axios"
import { and, eq, isNull, not } from "drizzle-orm"
import { PgliteDatabase, drizzle } from "drizzle-orm/pglite"

import { usePGlite } from "@/context/db"

import type { Note } from "@/db/interfaces"
import * as schema from "@/db/schema"

export interface NoteEmbeddingResponse {
  vault_id: string
  file_id: string
  note_id: string
  embedding: number[]
  error?: string
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

export interface NoteEmbeddingRequest {
  vault_id: string
  file_id: string
  note_id: string
  content: string
}

// Check if a note already has embeddings
export async function checkNoteHasEmbedding(
  db: PgliteDatabase<typeof schema>,
  noteId: string,
): Promise<boolean> {
  const embedding = await db.query.noteEmbeddings.findFirst({
    where: eq(schema.noteEmbeddings.noteId, noteId),
  })

  return !!embedding
}

// Submit a note for embedding
async function submitNoteEmbeddingTask(note: Note): Promise<TaskStatusResponse> {
  return axios
    .post<NoteEmbeddingRequest, { data: TaskStatusResponse }>(`${API_ENDPOINT}/notes/submit`, {
      vault_id: note.vaultId,
      file_id: note.fileId,
      note_id: note.id,
      content: note.content,
    })
    .then((resp) => resp.data)
    .catch((err) => {
      console.error(
        `[Embedding] Failed to submit note ${note.id}:`,
        err.response?.data?.error || err.message,
      )
      throw new Error(`Failed to submit note: ${err.response?.data?.error || err.message}`)
    })
}

// Check the status of an embedding task
async function checkNoteEmbeddingTask(taskId: string): Promise<TaskStatusResponse> {
  return axios
    .get<TaskStatusResponse>(`${API_ENDPOINT}/notes/status`, {
      params: { task_id: taskId },
    })
    .then((resp) => resp.data)
    .catch((error) => {
      console.error(
        `[Embedding] Status check failed for task ${taskId}:`,
        error.response?.data?.error || error.message,
      )
      return {
        task_id: taskId,
        status: "failure" as const,
        created_at: new Date().toISOString(),
        executed_at: new Date().toISOString(),
      }
    })
}

// Get embedding results for a completed task
async function getNoteEmbeddingTask(taskId: string): Promise<NoteEmbeddingResponse> {
  return axios
    .get<NoteEmbeddingResponse>(`${API_ENDPOINT}/notes/get`, {
      params: { task_id: taskId },
    })
    .then((resp) => {
      const embedData = resp.data

      // Validate the response is a note embedding response
      if (!embedData.note_id || !embedData.embedding || !Array.isArray(embedData.embedding)) {
        console.error(
          `[Embedding] Invalid note embedding response format for task ${taskId}:`,
          embedData,
        )
        throw new Error(`Invalid response format: missing note_id or embedding array`)
      }

      return embedData
    })
    .catch((error) => {
      console.error(
        `[Embedding] Failed to get embedding for task ${taskId}:`,
        error.response?.data?.error || error.message,
      )
      throw new Error(`Failed to get embedding: ${error.response?.data?.error || error.message}`)
    })
}

// Save embedding to database
async function saveNoteEmbedding(
  db: PgliteDatabase<typeof schema>,
  result: NoteEmbeddingResponse,
): Promise<void> {
  try {
    // Validate the embedding result format
    if (!result.note_id || !result.embedding || !Array.isArray(result.embedding)) {
      console.error(`[Embedding] Cannot save invalid embedding for note ${result.note_id}:`, result)

      // Update note status to failure
      if (result.note_id) {
        await db
          .update(schema.notes)
          .set({
            embeddingStatus: "failure",
            embeddingTaskId: null,
          })
          .where(eq(schema.notes.id, result.note_id))
      }

      return
    }

    // Check if note exists before updating it
    const existingNote = await db.query.notes.findFirst({
      where: eq(schema.notes.id, result.note_id),
    })

    if (!existingNote) {
      console.error(
        `[Embedding] Cannot save embedding: Note ${result.note_id} not found in database`,
      )
      return
    }

    // First update the note's status
    await db
      .update(schema.notes)
      .set({
        embeddingStatus: "success",
        embeddingTaskId: null,
      })
      .where(eq(schema.notes.id, result.note_id))

    // Check if an embedding already exists
    const existingEmbedding = await db.query.noteEmbeddings.findFirst({
      where: eq(schema.noteEmbeddings.noteId, result.note_id),
    })

    if (existingEmbedding) {
      await db
        .update(schema.noteEmbeddings)
        .set({
          embedding: result.embedding,
          createdAt: new Date(),
        })
        .where(eq(schema.noteEmbeddings.noteId, result.note_id))
    } else {
      // Insert new embedding
      await db.insert(schema.noteEmbeddings).values({
        noteId: result.note_id,
        embedding: result.embedding,
        createdAt: new Date(),
      })
    }
  } catch (error) {
    console.error(`[Embedding] Error saving embedding for note ${result.note_id}:`, error)

    // Try to update the note to indicate failure
    try {
      await db
        .update(schema.notes)
        .set({
          embeddingStatus: "failure",
          embeddingTaskId: null,
        })
        .where(eq(schema.notes.id, result.note_id))
    } catch (err) {
      console.error(`[Embedding] Failed to update note status for ${result.note_id}:`, err)
    }
  }
}

// Hook for polling embedding status and handling completion
export function useQueryNoteEmbeddingStatus(taskId: string | null | undefined) {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  return useQuery({
    queryKey: ["noteEmbedding", taskId],
    queryFn: async () => {
      if (!taskId) {
        throw new Error("Task ID is required")
      }

      try {
        // Check task status
        const statusData = await checkNoteEmbeddingTask(taskId)

        // If completed successfully, get and save the embedding
        if (statusData.status === "success") {
          try {
            // Ensure we're using the note-specific endpoint
            const result = await getNoteEmbeddingTask(taskId)

            // Validate the response format before saving
            if (!result.note_id || !result.embedding) {
              console.error(`[Embedding] Invalid note embedding format for task ${taskId}:`, result)
              throw new Error("Invalid note embedding format")
            }

            await saveNoteEmbedding(db, result)
            return { ...statusData, result }
          } catch (error) {
            console.error(`[Embedding] Failed to process successful task ${taskId}:`, error)

            // Find the notes with this task ID and mark as failed
            const notesWithTask = await db.query.notes.findMany({
              where: eq(schema.notes.embeddingTaskId, taskId),
            })

            for (const note of notesWithTask) {
              await db
                .update(schema.notes)
                .set({
                  embeddingStatus: "failure",
                  embeddingTaskId: null,
                })
                .where(eq(schema.notes.id, note.id))
            }

            return statusData
          }
        }

        // If the task failed or was cancelled, update notes
        if (statusData.status === "failure" || statusData.status === "cancelled") {
          const notesWithTask = await db.query.notes.findMany({
            where: eq(schema.notes.embeddingTaskId, taskId),
          })

          for (const note of notesWithTask) {
            await db
              .update(schema.notes)
              .set({
                embeddingStatus: statusData.status,
                embeddingTaskId: null,
              })
              .where(eq(schema.notes.id, note.id))
          }
        }

        return statusData
      } catch (error) {
        console.error(`[Embedding] Error in query function for task ${taskId}:`, error)
        // If there's an error, try to update any notes with this task ID
        try {
          const notesWithTask = await db.query.notes.findMany({
            where: eq(schema.notes.embeddingTaskId, taskId),
          })

          for (const note of notesWithTask) {
            await db
              .update(schema.notes)
              .set({
                embeddingStatus: "failure",
                embeddingTaskId: null,
              })
              .where(eq(schema.notes.id, note.id))
          }
        } catch (dbError) {
          console.error(`[Embedding] Failed to update notes for task ${taskId}:`, dbError)
        }

        throw error
      }
    },
    enabled: !!taskId,
    // Use refetchInterval for polling
    refetchInterval: (query) => {
      const status = query?.state?.data?.status
      const interval = status === "in_progress" ? POLLING_INTERVAL : false
      return interval
    },
    refetchOnWindowFocus: true,
    staleTime: 5000,
    retry: (failureCount) => {
      return failureCount < 3
    },
  })
}

// Submit a single note for embedding
export async function submitNoteForEmbedding(
  db: PgliteDatabase<typeof schema>,
  note: Note,
): Promise<boolean> {
  try {
    // First check if this note already has an embedding
    const hasEmbedding = await checkNoteHasEmbedding(db, note.id)
    if (hasEmbedding) {
      // Update note status if it's not already success
      if (note.embeddingStatus !== "success") {
        await db
          .update(schema.notes)
          .set({
            embeddingStatus: "success",
            embeddingTaskId: null,
          })
          .where(eq(schema.notes.id, note.id))
      }

      return true
    }

    // If it's already in progress with a valid task ID, skip it
    if (note.embeddingStatus === "in_progress" && note.embeddingTaskId) {
      return true
    }

    // Otherwise, submit for embedding
    const response = await submitNoteEmbeddingTask(note)

    // Before updating the note, ensure the task exists in the tasks table
    const existingTask = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, response.task_id),
    })

    if (!existingTask) {
      // Safely create dates
      const createdAt = safeDate(response.created_at) || new Date()
      const completedAt = safeDate(response.executed_at)

      // Insert the task first to satisfy the foreign key constraint
      await db.insert(schema.tasks).values({
        id: response.task_id,
        status: response.status,
        createdAt: createdAt,
        completedAt: completedAt,
        error: null,
      })
    }

    // After ensuring the task exists, update the note
    await db
      .update(schema.notes)
      .set({
        embeddingStatus: "in_progress",
        embeddingTaskId: response.task_id,
      })
      .where(eq(schema.notes.id, note.id))

    return true
  } catch (error) {
    console.error(`[Embedding] Failed to submit note ${note.id} for embedding:`, error)

    // Update the note to indicate failure
    try {
      await db
        .update(schema.notes)
        .set({
          embeddingStatus: "failure",
          embeddingTaskId: null,
        })
        .where(eq(schema.notes.id, note.id))
    } catch (err) {
      console.error(`[Embedding] Failed to update note status for ${note.id}:`, err)
    }

    return false
  }
}

// Submit multiple notes for embedding efficiently
export async function submitNotesForEmbedding(
  db: PgliteDatabase<typeof schema>,
  notes: Note[],
): Promise<void> {
  if (notes.length === 0) return

  // Process notes one at a time to avoid overwhelming the server
  for (const note of notes) {
    await submitNoteForEmbedding(db, note)
  }
}

// Hook to process notes that need embedding
export function useProcessPendingEmbeddings() {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  return useMutation({
    mutationFn: async (options?: { addTask?: (taskId: string) => void }) => {
      const { addTask } = options || {}

      // Find a limited number of notes with "in_progress" status that have a task ID
      const pendingNotes = await db.query.notes.findMany({
        where: and(
          eq(schema.notes.embeddingStatus, "in_progress"),
          not(isNull(schema.notes.embeddingTaskId)),
        ),
        limit: 5, // Only get up to 5 to avoid processing too many
      })

      // The number of notes we actually found with task IDs
      let processedCount = 0

      // Register each task for polling if it has a valid task ID
      for (const note of pendingNotes) {
        if (note.embeddingTaskId && addTask) {
          addTask(note.embeddingTaskId)
          processedCount++
        }
      }

      // Find notes that need initial processing (no embeddings yet)
      const notesWithoutEmbeddings = await db.query.notes.findMany({
        where: and(
          not(eq(schema.notes.embeddingStatus, "success")),
          isNull(schema.notes.embeddingTaskId),
          not(eq(schema.notes.embeddingStatus, "failure")),
        ),
        limit: 5, // Process a small batch
      })

      // Process notes that need embeddings but don't have a task yet
      for (const note of notesWithoutEmbeddings) {
        const hasEmbedding = await checkNoteHasEmbedding(db, note.id)
        if (!hasEmbedding) {
          const result = await submitNoteForEmbedding(db, note)

          if (result) {
            // After submitting, check if we got a task ID
            const updatedNote = await db.query.notes.findFirst({
              where: eq(schema.notes.id, note.id),
            })

            // Register for polling if we have a task ID
            if (updatedNote?.embeddingTaskId && addTask) {
              addTask(updatedNote.embeddingTaskId)
              processedCount++
            }
          }
        } else {
          // Update the status to success if we found an embedding but status isn't success
          if (note.embeddingStatus !== "success") {
            await db
              .update(schema.notes)
              .set({
                embeddingStatus: "success",
                embeddingTaskId: null,
              })
              .where(eq(schema.notes.id, note.id))
          }
        }
      }
      return processedCount
    },
  })
}
