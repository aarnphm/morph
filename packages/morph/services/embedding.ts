// services/embeddings.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { eq } from "drizzle-orm"
import { client } from "@/context/db"
import * as schema from "@/db/schema"
import type { Note } from "@/db/interfaces"
import { API_ENDPOINT, POLLING_INTERVAL } from "@/services/constants"

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

// Submit a note for embedding
async function submitNoteForEmbedding(note: Note): Promise<TaskStatusResponse> {
  const response = await fetch(`${API_ENDPOINT}/notes/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vault_id: note.vaultId,
      file_id: note.fileId,
      note_id: note.id,
      content: note.content
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(`Failed to submit note: ${error.error || response.statusText}`)
  }

  return response.json()
}

// Check the status of an embedding task
async function checkEmbeddingStatus(taskId: string): Promise<TaskStatusResponse> {
  const response = await fetch(`${API_ENDPOINT}/notes/status?task_id=${taskId}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(`Failed to check status: ${error.error || response.statusText}`)
  }

  return response.json()
}

// Get embedding results for a completed task
async function getEmbeddingResult(taskId: string): Promise<NoteEmbeddingResponse> {
  const response = await fetch(`${API_ENDPOINT}/notes/get?task_id=${taskId}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(`Failed to get embedding: ${error.error || response.statusText}`)
  }

  return response.json()
}

// Save embedding to database
async function saveEmbeddingToDatabase(result: NoteEmbeddingResponse): Promise<void> {
  await db.update(schema.notes)
    .set({
      embedding: result.embedding,
      embeddingStatus: "completed",
      embeddingTaskId: null
    })
    .where(eq(schema.notes.id, result.note_id))
}

// Hook for submitting a note embedding
export function useSubmitNoteEmbedding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitNoteForEmbedding,
    onSuccess: (data, note) => {
      // Update the note with the task ID
      db.update(schema.notes)
        .set({
          embeddingStatus: "in_progress",
          embeddingTaskId: data.task_id
        })
        .where(eq(schema.notes.id, note.id))
        .then(() => {
          // Start polling for this task
          queryClient.prefetchQuery({
            queryKey: ["noteEmbeddingStatus", data.task_id],
            queryFn: () => checkEmbeddingStatus(data.task_id)
          })
        })
    }
  })
}

// Hook for polling embedding status and handling completion
export function useNoteEmbeddingStatus(taskId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ["noteEmbeddingStatus", taskId],
    queryFn: () => {
      if (!taskId) throw new Error("Task ID is required")
      return checkEmbeddingStatus(taskId)
    },
    enabled: !!taskId,
    refetchInterval: (data) => {
      return data?.status === "in_progress" ? POLLING_INTERVAL : false
    },
    refetchOnWindowFocus: true,
    staleTime: POLLING_INTERVAL / 2,

    select: async (data) => {
      // If the task is complete, fetch the result
      if (data.status === "success") {
        try {
          const result = await getEmbeddingResult(data.task_id)
          // Save to database
          await saveEmbeddingToDatabase(result)
          return { ...data, result }
        } catch (error) {
          console.error("Error fetching or saving embedding result:", error)
          return data
        }
      }
      return data
    }
  })
}

// Submit multiple notes for embedding (can be used by the editor)
export function submitMultipleNotes(notes: Note[]) {
  // For each note, submit it for embedding
  notes.forEach(note => {
    // Only submit notes that don't already have an embedding or in-progress task
    if (note.embeddingStatus !== "in_progress" && !note.embedding) {
      submitNoteForEmbedding(note)
        .then(response => {
          // Update the note with the task ID
          return db.update(schema.notes)
            .set({
              embeddingStatus: "in_progress",
              embeddingTaskId: response.task_id
            })
            .where(eq(schema.notes.id, note.id))
        })
        .catch(error => {
          console.error(`Failed to submit note ${note.id} for embedding:`, error)
        })
    }
  })
}

// Hook to automatically process notes that need embedding
export function useProcessPendingEmbeddings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      // Find all notes with "in_progress" status
      const pendingNotes = await db.query.notes.findMany({
        where: eq(schema.notes.embeddingStatus, "in_progress")
      })

      // Set up polling for each pending note with a task ID
      pendingNotes
        .filter(note => note.embeddingTaskId)
        .forEach(note => {
          queryClient.prefetchQuery({
            queryKey: ["noteEmbeddingStatus", note.embeddingTaskId],
            queryFn: () => checkEmbeddingStatus(note.embeddingTaskId!)
          })
        })

      return pendingNotes.length
    }
  })
}
