import { API_ENDPOINT, POLLING_INTERVAL, TaskStatusResponse } from "@/services/constants"
import { useMutation, useQuery } from "@tanstack/react-query"
import { eq } from "drizzle-orm"
import { PgliteDatabase, drizzle } from "drizzle-orm/pglite"

import { usePGlite } from "@/context/db"

import * as schema from "@/db/schema"

export interface AuthorRequest {
  essay: string
  num_authors?: number
  top_p?: number
  temperature?: number
  max_tokens?: number
  authors?: string[]
  search_backend?: "exa"
  num_search_results?: number
}

export interface AuthorResponse {
  authors: string[]
  queries?: string[]
}

// Check if a file already has authors
export async function checkFileHasAuthors(
  db: PgliteDatabase<typeof schema>,
  fileId: string,
): Promise<boolean> {
  try {
    // First get the file to check if it exists
    const file = await db.query.files.findFirst({
      where: eq(schema.files.id, fileId),
    })

    if (!file) {
      console.error(`[Authors] File ${fileId} not found in database`)
      return false
    }

    // Check if there are any authors for this file
    const authorRecords = await db.query.authors.findFirst({
      where: eq(schema.authors.fileId, fileId),
    })

    // If we have authors and they're successful, the file has been processed
    return !!authorRecords && authorRecords.authorStatus === "success"
  } catch (error) {
    console.error(`[Authors] Error checking if file ${fileId} has authors:`, error)
    return false
  }
}

// Submit a file for author recommendations
async function submitAuthorTask(
  content: string,
  options: {
    num_authors?: number
    temperature?: number
    max_tokens?: number
  } = {},
): Promise<TaskStatusResponse> {
  const req: AuthorRequest = {
    essay: content,
    num_authors: options.num_authors || 8,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 16384,
    search_backend: "exa",
    num_search_results: 3,
  }

  const response = await fetch(`${API_ENDPOINT}/authors/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    console.error(
      `[Authors] Failed to submit content for author recommendations:`,
      error.error || response.statusText,
    )
    throw new Error(`Failed to submit for author recommendations: ${error.error || response.statusText}`)
  }

  const responseData = await response.json()
  return responseData
}

// Check the status of an author task
async function checkAuthorTask(taskId: string): Promise<TaskStatusResponse> {
  try {
    const response = await fetch(`${API_ENDPOINT}/authors/status?task_id=${taskId}`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      console.error(
        `[Authors] Status check failed for task ${taskId}:`,
        error.error || response.statusText,
      )
      throw new Error(`Failed to check status: ${error.error || response.statusText}`)
    }

    const statusData = await response.json()
    return statusData
  } catch (error) {
    console.error(`[Authors] Error checking task status for ${taskId}:`, error)
    // Return a failure status for any errors
    return {
      task_id: taskId,
      status: "failure" as const,
      created_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
    }
  }
}

// Get author recommendations for a completed task
async function getAuthorTask(taskId: string): Promise<AuthorResponse> {
  const response = await fetch(`${API_ENDPOINT}/authors/get?task_id=${taskId}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    console.error(
      `[Authors] Failed to get recommendations for task ${taskId}:`,
      error.error || response.statusText,
    )
    throw new Error(`Failed to get recommendations: ${error.error || response.statusText}`)
  }

  const authorsData = await response.json()

  // Verify we received the correct type of response
  if (!authorsData.authors || !Array.isArray(authorsData.authors)) {
    console.error(
      `[Authors] Invalid response format for task ${taskId}, missing authors array:`,
      authorsData,
    )
    throw new Error(`Invalid response format: missing authors array`)
  }

  return authorsData
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

// Save author recommendations to database
async function saveAuthorRecommendations(
  db: PgliteDatabase<typeof schema>,
  fileId: string,
  result: AuthorResponse,
): Promise<void> {
  try {
    // Check if file exists before updating it
    const existingFile = await db.query.files.findFirst({
      where: eq(schema.files.id, fileId),
    })

    if (!existingFile) {
      console.error(
        `[Authors] Cannot save recommendations: File ${fileId} not found in database`,
      )
      return
    }

    // Check if this file already has an author record
    const existingAuthor = await db.query.authors.findFirst({
      where: eq(schema.authors.fileId, fileId),
    })

    if (existingAuthor) {
      // Update existing record
      await db
        .update(schema.authors)
        .set({
          recommendedAuthors: result.authors,
          queries: result.queries || [],
          authorStatus: "success",
          authorTaskId: null,
        })
        .where(eq(schema.authors.id, existingAuthor.id))
    } else {
      // Insert new record
      await db.insert(schema.authors).values({
        fileId: fileId,
        recommendedAuthors: result.authors,
        queries: result.queries || [],
        createdAt: new Date(),
        authorStatus: "success",
        authorTaskId: null,
      })
    }
  } catch (error) {
    console.error(`[Authors] Error saving recommendations for file ${fileId}:`, error)

    // Try to update the author record to indicate failure
    try {
      const existingAuthor = await db.query.authors.findFirst({
        where: eq(schema.authors.fileId, fileId),
      })

      if (existingAuthor) {
        await db
          .update(schema.authors)
          .set({
            authorStatus: "failure",
            authorTaskId: null,
          })
          .where(eq(schema.authors.id, existingAuthor.id))
      }
    } catch (err) {
      console.error(`[Authors] Failed to update author status for ${fileId}:`, err)
    }
  }
}

// Hook for polling author task status and handling completion
export function useQueryAuthorStatus(taskId: string | null | undefined, fileId: string | null | undefined) {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  return useQuery({
    queryKey: ["authors", taskId, fileId],
    queryFn: async () => {
      if (!taskId || !fileId) {
        throw new Error("Task ID and File ID are required")
      }

      try {
        // Check task status
        const statusData = await checkAuthorTask(taskId)

        // If completed successfully, get and save the recommendations
        if (statusData.status === "success") {
          try {
            const result = await getAuthorTask(taskId)

            // Verify this is a valid response before saving
            if (!result.authors || !Array.isArray(result.authors)) {
              console.error(
                `[Authors] Received invalid response for task ${taskId}:`,
                result,
              )
              throw new Error("Invalid response format: missing authors array")
            }

            await saveAuthorRecommendations(db, fileId, result)
            return { ...statusData, result }
          } catch (error) {
            console.error(`[Authors] Failed to process successful task ${taskId}:`, error)

            // Find the author record with this task ID and mark as failed
            const authorWithTask = await db.query.authors.findFirst({
              where: eq(schema.authors.authorTaskId, taskId),
            })

            if (authorWithTask) {
              await db
                .update(schema.authors)
                .set({
                  authorStatus: "failure",
                  authorTaskId: null,
                })
                .where(eq(schema.authors.id, authorWithTask.id))
            }

            return statusData
          }
        }

        // If the task failed or was cancelled, update author record
        if (statusData.status === "failure" || statusData.status === "cancelled") {
          const authorWithTask = await db.query.authors.findFirst({
            where: eq(schema.authors.authorTaskId, taskId),
          })

          if (authorWithTask) {
            await db
              .update(schema.authors)
              .set({
                authorStatus: statusData.status,
                authorTaskId: null,
              })
              .where(eq(schema.authors.id, authorWithTask.id))
          }
        }

        return statusData
      } catch (error) {
        console.error(`[Authors] Error in query function for task ${taskId}:`, error)
        // If there's an error, try to update any author records with this task ID
        try {
          const authorWithTask = await db.query.authors.findFirst({
            where: eq(schema.authors.authorTaskId, taskId),
          })

          if (authorWithTask) {
            await db
              .update(schema.authors)
              .set({
                authorStatus: "failure",
                authorTaskId: null,
              })
              .where(eq(schema.authors.id, authorWithTask.id))
          }
        } catch (dbError) {
          console.error(`[Authors] Failed to update author record for task ${taskId}:`, dbError)
        }

        throw error
      }
    },
    enabled: !!taskId && !!fileId,
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

// Submit content for author recommendations
export async function submitContentForAuthors(
  db: PgliteDatabase<typeof schema>,
  fileId: string,
  content: string,
): Promise<string | null> {
  try {
    // First check if this file already has authors
    const hasAuthors = await checkFileHasAuthors(db, fileId)
    if (hasAuthors) {
      return null // No need to submit again
    }

    // Check if it's already in progress with a valid task ID
    const authorRecord = await db.query.authors.findFirst({
      where: eq(schema.authors.fileId, fileId),
    })

    if (authorRecord && authorRecord.authorStatus === "in_progress" && authorRecord.authorTaskId) {
      return authorRecord.authorTaskId // Return existing task ID
    }

    // Otherwise, submit for author recommendations
    const response = await submitAuthorTask(content)

    // Before updating the author record, ensure the task exists in the tasks table
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

    // After ensuring the task exists, update or create the author record
    if (authorRecord) {
      await db
        .update(schema.authors)
        .set({
          authorStatus: "in_progress",
          authorTaskId: response.task_id,
        })
        .where(eq(schema.authors.id, authorRecord.id))
    } else {
      await db.insert(schema.authors).values({
        fileId: fileId,
        recommendedAuthors: [],
        queries: [],
        createdAt: new Date(),
        authorStatus: "in_progress",
        authorTaskId: response.task_id,
      })
    }

    return response.task_id
  } catch (error) {
    console.error(`[Authors] Failed to submit content for ${fileId}:`, error)

    // Update the author record to indicate failure
    try {
      const authorRecord = await db.query.authors.findFirst({
        where: eq(schema.authors.fileId, fileId),
      })

      if (authorRecord) {
        await db
          .update(schema.authors)
          .set({
            authorStatus: "failure",
            authorTaskId: null,
          })
          .where(eq(schema.authors.id, authorRecord.id))
      } else {
        // Create a new record with failure status
        await db.insert(schema.authors).values({
          fileId: fileId,
          recommendedAuthors: [],
          queries: [],
          createdAt: new Date(),
          authorStatus: "failure",
          authorTaskId: null,
        })
      }
    } catch (err) {
      console.error(`[Authors] Failed to update author status for ${fileId}:`, err)
    }

    return null
  }
}

// Hook to get recommended authors for a file
export function useRecommendedAuthors(fileId: string | null | undefined) {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  return useQuery({
    queryKey: ["recommendedAuthors", fileId],
    queryFn: async () => {
      if (!fileId) return { authors: [] }

      try {
        const authorRecord = await db.query.authors.findFirst({
          where: eq(schema.authors.fileId, fileId),
        })

        if (authorRecord && authorRecord.recommendedAuthors.length > 0) {
          return { authors: authorRecord.recommendedAuthors }
        }

        return { authors: [] }
      } catch (error) {
        console.error(`[Authors] Failed to get recommended authors for ${fileId}:`, error)
        return { authors: [] }
      }
    },
    enabled: !!fileId,
  })
}

// Hook to process author recommendations when a new file is opened
export function useProcessAuthors() {
  const client = usePGlite()
  const db = drizzle({ client, schema })

  return useMutation({
    mutationFn: async (options: {
      addTask: (taskId: string, fileId: string) => void
      content: string
      fileId: string
    }) => {
      const { addTask, content, fileId } = options

      try {
        const hasAuthors = await checkFileHasAuthors(db, fileId)

        if (!hasAuthors) {
          const taskId = await submitContentForAuthors(db, fileId, content)

          if (taskId) {
            addTask(taskId, fileId)
            return { submitted: true, taskId }
          }
        }

        return { submitted: false }
      } catch (error) {
        console.error(`[Authors] Failed to process authors for ${fileId}:`, error)
        return { submitted: false, error }
      }
    }
  })
}
