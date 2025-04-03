import { useQueryEmbeddingStatus } from "@/services/embedding"
import { memo, useCallback, useEffect, useMemo } from "react"

import { useEmbeddingTasks } from "@/context/embedding"

/**
 * Component that manages embedding tasks polling.
 * This is a "headless" component that doesn't render anything.
 */
export const EmbeddingProcessor = memo(function EmbeddingProcessor() {
  // Use our context hook instead of local state
  const { pendingTaskIds, removeTask } = useEmbeddingTasks()

  // Memoize the removeTask callback to prevent unnecessary rerenders
  const handleTaskComplete = useCallback(
    (taskId: string) => {
      console.debug(`[Embedding] Task ${taskId} completed, removing from pending tasks`)
      removeTask(taskId)
    },
    [removeTask]
  )

  // Log when the processor mounts/unmounts
  useEffect(() => {
    console.debug(
      `[Embedding] EmbeddingProcessor mounted with ${pendingTaskIds.length} pending tasks`,
    )
    return () => {
      console.debug(`[Embedding] EmbeddingProcessor unmounting`)
    }
  }, [pendingTaskIds.length])

  // Log when pending tasks change
  useEffect(() => {
    if (pendingTaskIds.length > 0) {
      console.debug(
        `[Embedding] Pending tasks updated: ${pendingTaskIds.length} tasks - ${pendingTaskIds.join(", ")}`,
      )
    }
  }, [pendingTaskIds])

  // Memoize the task pollers to prevent unnecessary rerenders
  const taskPollers = useMemo(() => {
    return pendingTaskIds.map((taskId) => (
      <EmbeddingTaskPoller
        key={taskId}
        taskId={taskId}
        onComplete={() => handleTaskComplete(taskId)}
      />
    ))
  }, [pendingTaskIds, handleTaskComplete])

  // Return the task pollers
  return <>{taskPollers}</>
})

interface EmbeddingTaskPollerProps {
  taskId: string
  onComplete: () => void
}

/**
 * Component that polls a single embedding task
 */
const EmbeddingTaskPoller = memo(function EmbeddingTaskPoller({ taskId, onComplete }: EmbeddingTaskPollerProps) {
  // Log when the poller is created/destroyed
  useEffect(() => {
    console.debug(`[Embedding] TaskPoller created for task ${taskId}`)
    return () => {
      console.debug(`[Embedding] TaskPoller for task ${taskId} unmounting`)
    }
  }, [taskId])

  // Use the hook to poll this task
  const { data, isSuccess, isError, status } = useQueryEmbeddingStatus(taskId)

  // Log query status changes
  useEffect(() => {
    console.debug(`[Embedding] TaskPoller for task ${taskId} - query status: ${status}`)
  }, [status, taskId])

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
      console.debug(
        `[Embedding] Task ${taskId} completed with status: ${isSuccessful ? "success" : "failure"}`,
      )
      onComplete()
    }
  }, [isSuccess, isError, data, taskId, onComplete])

  // This is a headless component, so it doesn't render anything
  return null
})
