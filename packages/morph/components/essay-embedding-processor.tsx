import { useQueryEssayEmbeddingStatus } from "@/services/essays"
import { memo, useCallback, useEffect, useMemo } from "react"

import { useEssayEmbeddingTasks } from "@/context/embedding"

/**
 * Component that manages essay embedding tasks polling.
 * This is a "headless" component that doesn't render anything.
 */
export const EssayEmbeddingProcessor = memo(function EssayEmbeddingProcessor() {
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
  const taskPollers = useMemo(() => {
    if (pendingTaskIds.length === 0) {
      return null // Return null if there are no pending tasks
    }

    return pendingTaskIds.map((taskId) => (
      <EssayEmbeddingTaskPoller
        key={taskId}
        taskId={taskId}
        onComplete={() => handleTaskComplete(taskId)}
      />
    ))
  }, [pendingTaskIds, handleTaskComplete])

  // Return the task pollers only if there are tasks to poll
  return <>{taskPollers}</>
})

interface EssayEmbeddingTaskPollerProps {
  taskId: string
  onComplete: () => void
}

/**
 * Component that polls a single essay embedding task
 */
const EssayEmbeddingTaskPoller = memo(function EssayEmbeddingTaskPoller({
  taskId,
  onComplete,
}: EssayEmbeddingTaskPollerProps) {
  // Use the hook to poll this task, but only if we have a valid taskId
  const { data, isSuccess, isError } = useQueryEssayEmbeddingStatus(taskId)

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
