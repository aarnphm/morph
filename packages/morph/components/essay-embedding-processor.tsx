import { useQueryEssayEmbeddingStatus } from "@/services/essays"
import { PgliteDatabase } from "drizzle-orm/pglite"
import { memo, useCallback, useEffect } from "react"

import { useEssayEmbeddingTasks } from "@/context/embedding"

import * as schema from "@/db/schema"

/**
 * Component that manages essay embedding tasks polling.
 * This is a "headless" component that doesn't render anything.
 */
export const EssayEmbeddingProcessor = memo(function EssayEmbeddingProcessor({
  db,
}: {
  db: PgliteDatabase<typeof schema>
}) {
  // Use our context hook instead of local state
  const { pendingTaskIds, removeTask } = useEssayEmbeddingTasks()

  // Memoize the removeTask callback to prevent unnecessary rerenders
  const handleTaskComplete = useCallback(
    (taskId: string) => {
      removeTask(taskId)
    },
    [removeTask],
  )
  // Only create task pollers if there are pending tasks to process
  // This prevents unnecessary polling when there are no essays to process
  const TaskPollers = useCallback(() => {
    if (pendingTaskIds.length === 0) return null

    return pendingTaskIds.map((taskId) => (
      <EssayEmbeddingTaskPoller
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

interface EssayEmbeddingTaskPollerProps {
  taskId: string
  onComplete: () => void
  db: PgliteDatabase<typeof schema>
}

/**
 * Component that polls a single essay embedding task
 */
const EssayEmbeddingTaskPoller = memo(function EssayEmbeddingTaskPoller({
  taskId,
  onComplete,
  db,
}: EssayEmbeddingTaskPollerProps) {
  // Use the hook to poll this task, but only if we have a valid taskId
  const { data, isSuccess, isError } = useQueryEssayEmbeddingStatus(taskId, db)

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
