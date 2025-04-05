import { useQueryNoteEmbeddingStatus } from "@/services/notes"
import { PgliteDatabase } from "drizzle-orm/pglite"
import { memo, useCallback, useEffect } from "react"

import { useEmbeddingTasks } from "@/context/embedding"

import * as schema from "@/db/schema"

/**
 * Component that manages embedding tasks polling.
 * This is a "headless" component that doesn't render anything.
 */
export const NoteEmbeddingProcessor = memo(function NoteEmbeddingProcessor({
  db,
}: {
  db: PgliteDatabase<typeof schema>
}) {
  // Use our context hook instead of local state
  const { pendingTaskIds, removeTask } = useEmbeddingTasks()

  // Memoize the removeTask callback to prevent unnecessary rerenders
  const handleTaskComplete = useCallback(
    (taskId: string) => {
      removeTask(taskId)
    },
    [removeTask],
  )

  // Only create task pollers if there are pending tasks to process
  // This prevents unnecessary polling when there are no notes to process
  const TaskPollers = useCallback(() => {
    if (pendingTaskIds.length === 0) return null

    return pendingTaskIds.map((taskId) => (
      <NoteEmbeddingTaskPoller
        key={taskId}
        taskId={taskId}
        db={db}
        onComplete={() => handleTaskComplete(taskId)}
      />
    ))
  }, [pendingTaskIds, handleTaskComplete, db])

  // Return the task pollers only if there are tasks to poll
  return <TaskPollers />
})

interface NoteEmbeddingTaskPollerProps {
  taskId: string
  onComplete: () => void
  db: PgliteDatabase<typeof schema>
}

/**
 * Component that polls a single embedding task
 */
const NoteEmbeddingTaskPoller = memo(function NoteEmbeddingTaskPoller({
  taskId,
  onComplete,
  db,
}: NoteEmbeddingTaskPollerProps) {
  // Use the hook to poll this task, but only if we have a valid taskId
  const { data, isSuccess, isError } = useQueryNoteEmbeddingStatus(taskId, db)

  // When task is successful or fails, call the onComplete callback
  useEffect(() => {
    // Check for success status
    const isSuccessful =
      isSuccess && data && typeof data === "object" && "status" in data && data.status === "success"

    // Check for failure status
    const isFailed =
      (isSuccess &&
        data &&
        typeof data === "object" &&
        "status" in data &&
        (data.status === "failure" || data.status === "cancelled")) ||
      isError

    if (isSuccessful || isFailed) {
      onComplete()
    }
  }, [isSuccess, isError, data, taskId, onComplete])

  // This is a headless component, so it doesn't render anything
  return null
})
