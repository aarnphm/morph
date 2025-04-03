// services/embeddings.ts
import { API_ENDPOINT, POLLING_INTERVAL } from "@/services/constants"
import { useMutation, useQuery } from "@tanstack/react-query"
import { and, eq, isNull, not } from "drizzle-orm"
import { PgliteDatabase, drizzle } from "drizzle-orm/pglite"

import { usePGlite } from "@/context/db"

import type { Note } from "@/db/interfaces"
import * as schema from "@/db/schema"

// Types based on OpenAPI spec
export interface TaskStatusResponse {
  task_id: string
  status: "in_progress" | "success" | "failure" | "cancelled"
  created_at: string
  executed_at: string | null
}

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
  console.debug(`[Embedding] Submitting note ${note.id} for embedding...`)
  const response = await fetch(`${API_ENDPOINT}/notes/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vault_id: note.vaultId,
      file_id: note.fileId,
      note_id: note.id,
      content: note.content,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    console.error(
      `[Embedding] Failed to submit note ${note.id}:`,
      error.error || response.statusText,
    )
    throw new Error(`Failed to submit note: ${error.error || response.statusText}`)
  }

  const responseData = await response.json()
  console.debug(
    `[Embedding] Note ${note.id} submitted successfully, task_id: ${responseData.task_id}`,
  )
  return responseData
}

// Check the status of an embedding task
async function checkNoteEmbeddingTask(taskId: string): Promise<TaskStatusResponse> {
  try {
    console.debug(`[Embedding] Checking status for task ${taskId}...`)
    const response = await fetch(`${API_ENDPOINT}/notes/status?task_id=${taskId}`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      console.error(
        `[Embedding] Status check failed for task ${taskId}:`,
        error.error || response.statusText,
      )
      throw new Error(`Failed to check status: ${error.error || response.statusText}`)
    }

    const statusData = await response.json()
    console.debug(`[Embedding] Status for task ${taskId}: ${statusData.status}`)
    return statusData
  } catch (error) {
    console.error(`[Embedding] Error checking task status for ${taskId}:`, error)
    // Return a failure status for any errors
    return {
      task_id: taskId,
      status: "failure" as const,
      created_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
    }
  }
}

// Get embedding results for a completed task
async function getNoteEmbeddingTask(taskId: string): Promise<NoteEmbeddingResponse> {
  console.debug(`[Embedding] Retrieving embedding result for task ${taskId}...`)
  const response = await fetch(`${API_ENDPOINT}/notes/get?task_id=${taskId}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    console.error(
      `[Embedding] Failed to get embedding for task ${taskId}:`,
      error.error || response.statusText,
    )
    throw new Error(`Failed to get embedding: ${error.error || response.statusText}`)
  }

  const embedData = await response.json()
  console.debug(
    `[Embedding] Retrieved embedding for note ${embedData.note_id}, vector length: ${embedData.embedding.length}`,
  )
  return embedData
}

// Save embedding to database
async function saveNoteEmbedding(
  db: PgliteDatabase<typeof schema>,
  result: NoteEmbeddingResponse,
): Promise<void> {
  try {
    console.debug(`[Embedding] Saving embedding for note ${result.note_id} to database...`)
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
    console.debug(`[Embedding] Updating note ${result.note_id} status to success`)
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
      console.debug(`[Embedding] Updating existing embedding for note ${result.note_id}`)
      await db
        .update(schema.noteEmbeddings)
        .set({
          embedding: result.embedding,
          createdAt: new Date(),
        })
        .where(eq(schema.noteEmbeddings.noteId, result.note_id))
    } else {
      console.debug(`[Embedding] Inserting new embedding for note ${result.note_id}`)
      // Insert new embedding
      await db.insert(schema.noteEmbeddings).values({
        noteId: result.note_id,
        embedding: result.embedding,
        createdAt: new Date(),
      })
    }

    console.debug(`[Embedding] Successfully saved embedding for note ${result.note_id}`)
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

// Add a helper function to safely create dates
function safeDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null

  try {
    const date = new Date(dateStr)
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null
    }
    return date
  } catch (error) {
    console.error(`Failed to parse date string: ${dateStr}`, error)
    return null
  }
}

// Hook for polling embedding status and handling completion
export function useQueryEmbeddingStatus(taskId: string | null | undefined) {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  return useQuery({
    queryKey: ["noteEmbeddingStatus", taskId],
    queryFn: async () => {
      if (!taskId) {
        console.debug(`[Embedding] No task ID provided to useQueryEmbeddingStatus`)
        throw new Error("Task ID is required")
      }

      console.debug(`[Embedding] Query function executing for task: ${taskId}`)
      try {
        // Check task status
        const statusData = await checkNoteEmbeddingTask(taskId)

        // If completed successfully, get and save the embedding
        if (statusData.status === "success") {
          console.debug(`[Embedding] Task ${taskId} completed successfully, retrieving embedding`)
          try {
            const result = await getNoteEmbeddingTask(taskId)
            console.debug(`[Embedding] Retrieved embedding for task ${taskId}, saving to database`)
            await saveNoteEmbedding(db, result)
            console.debug(`[Embedding] Successfully processed completed task ${taskId}`)
            return { ...statusData, result }
          } catch (error) {
            console.error(`[Embedding] Failed to process successful task ${taskId}:`, error)

            // Find the notes with this task ID and mark as failed
            const notesWithTask = await db.query.notes.findMany({
              where: eq(schema.notes.embeddingTaskId, taskId),
            })

            console.debug(
              `[Embedding] Marking ${notesWithTask.length} notes as failed due to error processing embedding`,
            )
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
          console.debug(`[Embedding] Task ${taskId} status is ${statusData.status}, updating notes`)
          const notesWithTask = await db.query.notes.findMany({
            where: eq(schema.notes.embeddingTaskId, taskId),
          })

          console.debug(
            `[Embedding] Marking ${notesWithTask.length} notes with status ${statusData.status}`,
          )
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

          console.debug(
            `[Embedding] Marking ${notesWithTask.length} notes as failed due to query error`,
          )
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
      if (interval) {
        console.debug(`[Embedding] Continue polling task ${taskId} - status: ${status}`)
      } else if (status) {
        console.debug(`[Embedding] Stopping polling for task ${taskId} - status: ${status}`)
      }
      return interval
    },
    refetchOnWindowFocus: true,
    staleTime: 5000,
    retry: (failureCount) => {
      const shouldRetry = failureCount < 3
      console.debug(
        `[Embedding] Query for task ${taskId} failed ${failureCount} times, ${shouldRetry ? "retrying" : "stopping retries"}`,
      )
      return shouldRetry
    },
  })
}

// Submit a single note for embedding
export async function submitNoteForEmbedding(
  db: PgliteDatabase<typeof schema>,
  note: Note,
): Promise<boolean> {
  try {
    console.debug(`[Embedding] Processing note ${note.id} for embedding...`)
    // First check if this note already has an embedding
    const hasEmbedding = await checkNoteHasEmbedding(db, note.id)
    if (hasEmbedding) {
      console.debug(`[Embedding] Note ${note.id} already has embedding, skipping submission`)

      // Update note status if it's not already success
      if (note.embeddingStatus !== "success") {
        console.debug(
          `[Embedding] Updating note ${note.id} status to success (already has embedding)`,
        )
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
      console.debug(
        `[Embedding] Note ${note.id} is already in progress with task ${note.embeddingTaskId}, skipping submission`,
      )
      return true
    }

    // Otherwise, submit for embedding
    console.debug(`[Embedding] Submitting note ${note.id} for embedding task creation`)
    const response = await submitNoteEmbeddingTask(note)
    console.debug(`[Embedding] Task created: ${response.task_id} for note ${note.id}`)

    // Before updating the note, ensure the task exists in the tasks table
    const existingTask = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, response.task_id),
    })

    if (!existingTask) {
      // Safely create dates
      const createdAt = safeDate(response.created_at) || new Date()
      const completedAt = safeDate(response.executed_at)

      // Insert the task first to satisfy the foreign key constraint
      console.debug(`[Embedding] Creating task record in database: ${response.task_id}`)
      await db.insert(schema.tasks).values({
        id: response.task_id,
        status: response.status,
        createdAt: createdAt,
        completedAt: completedAt,
        error: null,
      })
    } else {
      console.debug(`[Embedding] Task ${response.task_id} already exists in database`)
    }

    // After ensuring the task exists, update the note
    console.debug(
      `[Embedding] Updating note ${note.id} status to in_progress with task ${response.task_id}`,
    )
    await db
      .update(schema.notes)
      .set({
        embeddingStatus: "in_progress",
        embeddingTaskId: response.task_id,
      })
      .where(eq(schema.notes.id, note.id))

    console.debug(`[Embedding] Successfully submitted note ${note.id} for embedding`)
    return true
  } catch (error) {
    console.error(`[Embedding] Failed to submit note ${note.id} for embedding:`, error)

    // Update the note to indicate failure
    try {
      console.debug(`[Embedding] Setting note ${note.id} status to failure`)
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
      console.debug(
        `[Embedding] Processing pending embeddings with ${addTask ? "provided" : "no"} addTask callback`,
      )

      // Find a limited number of notes with "in_progress" status that have a task ID
      console.debug(`[Embedding] Finding notes with in-progress status and task IDs`)
      const pendingNotes = await db.query.notes.findMany({
        where: and(
          eq(schema.notes.embeddingStatus, "in_progress"),
          not(isNull(schema.notes.embeddingTaskId)),
        ),
        limit: 5, // Only get up to 5 to avoid processing too many
      })

      console.debug(`[Embedding] Found ${pendingNotes.length} in-progress notes with task IDs`)

      // The number of notes we actually found with task IDs
      let processedCount = 0

      // Register each task for polling if it has a valid task ID
      for (const note of pendingNotes) {
        if (note.embeddingTaskId && addTask) {
          console.debug(
            `[Embedding] Adding task ${note.embeddingTaskId} for note ${note.id} to polling`,
          )
          addTask(note.embeddingTaskId)
          processedCount++
        }
      }

      // Find notes that need initial processing (no embeddings yet)
      console.debug(
        `[Embedding] Finding notes that need initial embedding processing (no task IDs yet)`,
      )
      const notesWithoutEmbeddings = await db.query.notes.findMany({
        where: and(
          not(eq(schema.notes.embeddingStatus, "success")),
          isNull(schema.notes.embeddingTaskId),
          not(eq(schema.notes.embeddingStatus, "failure")),
        ),
        limit: 5, // Process a small batch
      })

      console.debug(
        `[Embedding] Found ${notesWithoutEmbeddings.length} notes that need initial embedding processing`,
      )

      // Process notes that need embeddings but don't have a task yet
      let newTasksCount = 0
      for (const note of notesWithoutEmbeddings) {
        console.debug(`[Embedding] Checking note ${note.id} for embedding status`)
        const hasEmbedding = await checkNoteHasEmbedding(db, note.id)
        if (!hasEmbedding) {
          console.debug(`[Embedding] Note ${note.id} needs embedding, submitting...`)
          const result = await submitNoteForEmbedding(db, note)

          if (result) {
            console.debug(`[Embedding] Note ${note.id} submitted successfully`)

            // After submitting, check if we got a task ID
            const updatedNote = await db.query.notes.findFirst({
              where: eq(schema.notes.id, note.id),
            })

            // Register for polling if we have a task ID
            if (updatedNote?.embeddingTaskId && addTask) {
              console.debug(`[Embedding] Adding new task ${updatedNote.embeddingTaskId} to polling`)
              addTask(updatedNote.embeddingTaskId)
              processedCount++
              newTasksCount++
            }
          } else {
            console.debug(`[Embedding] Failed to submit note ${note.id} for embedding`)
          }
        } else {
          console.debug(`[Embedding] Note ${note.id} already has embedding, updating status`)
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

      console.debug(
        `[Embedding] Processing complete. Added ${processedCount} tasks for polling (${newTasksCount} new).`,
      )
      return processedCount
    },
  })
}
