import { safeDate } from "@/lib"
import { API_ENDPOINT, ESAAY_POLLING_INTERVAL } from "@/services/constants"
import { TaskStatusResponse } from "@/services/constants"
import { useMutation, useQuery } from "@tanstack/react-query"
import axios from "axios"
import { and, eq, isNull, not } from "drizzle-orm"
import { PgliteDatabase, drizzle } from "drizzle-orm/pglite"

import { usePGlite } from "@/context/db"

import * as schema from "@/db/schema"

interface EssayNodeMetadata extends EssayEmbeddingRequest {
  line_numbers: number[]
  start_line: number
  end_line: number
  line_map: Record<string, string>
  document_title: string
}

interface EssayNodeRelationship {
  node_id: string
  note_type: string
  metadata: Partial<EssayEmbeddingRequest>
  hash: string
  class_name: string
}

export interface EssayNodeEmbedding {
  embedding: number[]
  node_id: string
  metadata: EssayNodeMetadata
  relationships: Record<string, EssayNodeRelationship>
  metadata_separator: string
}

export interface EssayEmbeddingResponse {
  vault_id: string
  file_id: string
  nodes: EssayNodeEmbedding[]
  error?: string
}

export interface EssayEmbeddingRequest {
  vault_id: string
  file_id: string
  content: string
}

// Check if a file already has all its chunks embedded
export async function checkFileHasEmbeddings(
  db: PgliteDatabase<typeof schema>,
  fileId: string,
): Promise<boolean> {
  try {
    // First get the file to check if it exists
    const file = await db.query.files.findFirst({
      where: eq(schema.files.id, fileId),
    })

    if (!file) {
      console.error(`[EssayEmbedding] File ${fileId} not found in database`)
      return false
    }

    // Check if the file's embeddingStatus is already 'success'
    if (file.embeddingStatus === "success") {
      return true
    }

    // Check if there are any fileEmbeddings for this file
    const embeddings = await db.query.fileEmbeddings.findMany({
      where: eq(schema.fileEmbeddings.fileId, fileId),
    })

    // If we have embeddings, the file has been processed
    return embeddings.length > 0
  } catch (error) {
    console.error(`[EssayEmbedding] Error checking if file ${fileId} has embeddings:`, error)
    return false
  }
}

// Submit a file for embedding
async function submitFileEmbeddingTask(
  vaultId: string,
  fileId: string,
  content: string,
): Promise<TaskStatusResponse> {
  return axios
    .post<EssayEmbeddingRequest, { data: TaskStatusResponse }>(
      `${API_ENDPOINT}/essays/submit`,
      { vault_id: vaultId, file_id: fileId, content },
    )
    .then((resp) => resp.data)
    .catch((err) => {
      console.error(
        `[EssayEmbedding] Failed to submit file ${fileId}:`,
        err.response?.data?.error || err.message,
      )
      throw new Error(`Failed to submit file: ${err.response?.data?.error || err.message}`)
    })
}

// Check the status of an embedding task
async function checkFileEmbeddingTask(taskId: string): Promise<TaskStatusResponse> {
  return axios
    .get<TaskStatusResponse>(`${API_ENDPOINT}/essays/status`, {
      params: { task_id: taskId },
    })
    .then((resp) => resp.data)
    .catch((error) => {
      console.error(
        `[EssayEmbedding] Status check failed for task ${taskId}:`,
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
async function getFileEmbeddingTask(taskId: string): Promise<EssayEmbeddingResponse> {
  return axios
    .get<EssayEmbeddingResponse>(`${API_ENDPOINT}/essays/get`, {
      params: { task_id: taskId },
    })
    .then((resp) => {
      const embedData = resp.data

      // Verify we received the correct type of response
      if (!embedData.nodes || !Array.isArray(embedData.nodes)) {
        console.error(
          `[EssayEmbedding] Invalid response format for task ${taskId}, missing nodes array:`,
          embedData,
        )
        throw new Error(`Invalid response format: missing nodes array`)
      }

      return embedData
    })
    .catch((error) => {
      console.error(
        `[EssayEmbedding] Failed to get embedding for task ${taskId}:`,
        error.response?.data?.error || error.message,
      )
      throw new Error(`Failed to get embedding: ${error.response?.data?.error || error.message}`)
    })
}

// Save embeddings to database
async function saveFileEmbeddings(
  db: PgliteDatabase<typeof schema>,
  result: EssayEmbeddingResponse,
): Promise<void> {
  try {
    // Check if file exists before updating it
    const existingFile = await db.query.files.findFirst({
      where: and(eq(schema.files.id, result.file_id), eq(schema.files.vaultId, result.vault_id)),
    })

    if (!existingFile) {
      console.error(
        `[EssayEmbedding] Cannot save embeddings: File ${result.file_id} not found in database`,
      )
      return
    }

    // Check if the response is a note embedding incorrectly sent to this function
    if (!result.nodes || !Array.isArray(result.nodes)) {
      console.error(
        `[EssayEmbedding] Received invalid response format for file ${result.file_id}. Expected nodes array but got:`,
        result,
      )

      // Update the file's status to show there was an error
      await db
        .update(schema.files)
        .set({
          embeddingStatus: "failure",
          embeddingTaskId: null,
        })
        .where(eq(schema.files.id, result.file_id))

      return
    }

    // First update the file's status
    await db
      .update(schema.files)
      .set({
        embeddingStatus: "success",
        embeddingTaskId: null,
      })
      .where(eq(schema.files.id, result.file_id))

    // Process each node embedding
    for (const node of result.nodes) {
      // Check if this node embedding already exists
      const existingEmbedding = await db.query.fileEmbeddings.findFirst({
        where: and(
          eq(schema.fileEmbeddings.vaultId, result.vault_id),
          eq(schema.fileEmbeddings.fileId, result.file_id),
          eq(schema.fileEmbeddings.nodeId, node.node_id),
        ),
      })

      const embedData = {
        vaultId: result.vault_id,
        fileId: result.file_id,
        nodeId: node.node_id,
        embedding: node.embedding,
        metadataSeparator: node.metadata_separator,
        lineNumbers: node.metadata.line_numbers,
        startLine: node.metadata.start_line,
        endLine: node.metadata.end_line,
        lineMap: node.metadata.line_map,
        documentTitle: node.metadata.document_title,
        createdAt: new Date(),
      }

      if (existingEmbedding) {
        // Update existing embedding
        await db
          .update(schema.fileEmbeddings)
          .set(embedData)
          .where(
            and(
              eq(schema.fileEmbeddings.vaultId, result.vault_id),
              eq(schema.fileEmbeddings.fileId, result.file_id),
              eq(schema.fileEmbeddings.nodeId, node.node_id),
            ),
          )
      } else {
        // Insert new embedding
        await db.insert(schema.fileEmbeddings).values(embedData)
      }
    }
  } catch (error) {
    console.error(`[EssayEmbedding] Error saving embeddings for file ${result.file_id}:`, error)

    // Try to update the file to indicate failure
    try {
      await db
        .update(schema.files)
        .set({
          embeddingStatus: "failure",
          embeddingTaskId: null,
        })
        .where(eq(schema.files.id, result.file_id))
    } catch (err) {
      console.error(`[EssayEmbedding] Failed to update file status for ${result.file_id}:`, err)
    }
  }
}

// Hook for polling embedding status and handling completion
export function useQueryEssayEmbeddingStatus(taskId: string | null | undefined) {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  return useQuery({
    queryKey: ["essayEmbedding", taskId],
    queryFn: async () => {
      if (!taskId) {
        throw new Error("Task ID is required")
      }

      try {
        // Check task status
        const statusData = await checkFileEmbeddingTask(taskId)

        // If completed successfully, get and save the embedding
        if (statusData.status === "success") {
          try {
            // Ensure we're querying the essay-specific endpoint
            const result = await getFileEmbeddingTask(taskId)

            // Verify this is a file embedding response before saving
            if (!result.nodes) {
              console.error(
                `[EssayEmbedding] Received invalid response for task ${taskId}:`,
                result,
              )
              throw new Error("Invalid response format: missing nodes array")
            }

            await saveFileEmbeddings(db, result)
            return { ...statusData, result }
          } catch (error) {
            console.error(`[EssayEmbedding] Failed to process successful task ${taskId}:`, error)

            // Find the files with this task ID and mark as failed
            const filesWithTask = await db.query.files.findMany({
              where: eq(schema.files.embeddingTaskId, taskId),
            })

            for (const file of filesWithTask) {
              await db
                .update(schema.files)
                .set({
                  embeddingStatus: "failure",
                  embeddingTaskId: null,
                })
                .where(eq(schema.files.id, file.id))
            }

            return statusData
          }
        }

        // If the task failed or was cancelled, update files
        if (statusData.status === "failure" || statusData.status === "cancelled") {
          const filesWithTask = await db.query.files.findMany({
            where: eq(schema.files.embeddingTaskId, taskId),
          })

          for (const file of filesWithTask) {
            await db
              .update(schema.files)
              .set({
                embeddingStatus: statusData.status,
                embeddingTaskId: null,
              })
              .where(eq(schema.files.id, file.id))
          }
        }

        return statusData
      } catch (error) {
        console.error(`[EssayEmbedding] Error in query function for task ${taskId}:`, error)
        // If there's an error, try to update any files with this task ID
        try {
          const filesWithTask = await db.query.files.findMany({
            where: eq(schema.files.embeddingTaskId, taskId),
          })

          for (const file of filesWithTask) {
            await db
              .update(schema.files)
              .set({
                embeddingStatus: "failure",
                embeddingTaskId: null,
              })
              .where(eq(schema.files.id, file.id))
          }
        } catch (dbError) {
          console.error(`[EssayEmbedding] Failed to update files for task ${taskId}:`, dbError)
        }

        throw error
      }
    },
    enabled: !!taskId,
    // Use refetchInterval for polling
    refetchInterval: (query) => {
      const status = query?.state?.data?.status
      const interval = status === "in_progress" ? ESAAY_POLLING_INTERVAL : false
      return interval
    },
    refetchOnWindowFocus: true,
    staleTime: 5000,
    retry: (failureCount) => {
      return failureCount < 3
    },
  })
}

// Submit a file for embedding
export async function submitFileForEmbedding(
  db: PgliteDatabase<typeof schema>,
  vaultId: string,
  fileId: string,
  content: string,
): Promise<boolean> {
  try {
    // First check if this file already has embeddings
    const hasEmbeddings = await checkFileHasEmbeddings(db, fileId)
    if (hasEmbeddings) {
      // Update file status if it's not already success
      const file = await db.query.files.findFirst({
        where: eq(schema.files.id, fileId),
      })

      if (file && file.embeddingStatus !== "success") {
        await db
          .update(schema.files)
          .set({
            embeddingStatus: "success",
            embeddingTaskId: null,
          })
          .where(eq(schema.files.id, fileId))
      }

      return true
    }

    // Check if it's already in progress with a valid task ID
    const file = await db.query.files.findFirst({
      where: eq(schema.files.id, fileId),
    })

    if (file && file.embeddingStatus === "in_progress" && file.embeddingTaskId) {
      return true
    }

    // Otherwise, submit for embedding
    const response = await submitFileEmbeddingTask(vaultId, fileId, content)

    // Before updating the file, ensure the task exists in the tasks table
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

    // After ensuring the task exists, update the file
    await db
      .update(schema.files)
      .set({
        embeddingStatus: "in_progress",
        embeddingTaskId: response.task_id,
      })
      .where(eq(schema.files.id, fileId))

    return true
  } catch (error) {
    console.error(`[EssayEmbedding] Failed to submit file ${fileId} for embedding:`, error)

    // Update the file to indicate failure
    try {
      await db
        .update(schema.files)
        .set({
          embeddingStatus: "failure",
          embeddingTaskId: null,
        })
        .where(eq(schema.files.id, fileId))
    } catch (err) {
      console.error(`[EssayEmbedding] Failed to update file status for ${fileId}:`, err)
    }

    return false
  }
}

// Hook to process pending file embeddings
export function useProcessPendingEssayEmbeddings() {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  return useMutation({
    mutationFn: async (options?: {
      addTask?: (taskId: string) => void
      currentContent?: string
      currentVaultId?: string
      currentFileId?: string
    }) => {
      const { addTask, currentContent, currentVaultId, currentFileId } = options || {}

      // Process the current file if provided
      if (currentContent && currentVaultId && currentFileId) {
        const hasEmbeddings = await checkFileHasEmbeddings(db, currentFileId)
        if (!hasEmbeddings) {
          const result = await submitFileForEmbedding(
            db,
            currentVaultId,
            currentFileId,
            currentContent,
          )

          if (result) {
            // After submitting, check if we got a task ID
            const updatedFile = await db.query.files.findFirst({
              where: eq(schema.files.id, currentFileId),
            })

            // Register for polling if we have a task ID and use the essay-specific addTask function
            if (updatedFile?.embeddingTaskId && addTask) {
              addTask(updatedFile.embeddingTaskId)
              return 1 // Count as processed
            }
          }
        }
      }

      // Find a limited number of files with "in_progress" status that have a task ID
      const pendingFiles = await db.query.files.findMany({
        where: and(
          eq(schema.files.embeddingStatus, "in_progress"),
          not(isNull(schema.files.embeddingTaskId)),
        ),
        limit: 3, // Only get up to 3 to avoid processing too many
      })

      // The number of files we actually found with task IDs
      let processedCount = 0

      // Register each task for polling if it has a valid task ID
      // Use the essay-specific addTask function
      for (const file of pendingFiles) {
        if (file.embeddingTaskId && addTask) {
          addTask(file.embeddingTaskId)
          processedCount++
        }
      }

      return processedCount
    },
  })
}
