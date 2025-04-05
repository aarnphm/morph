import { useQueryNoteEmbeddingStatus } from "@/services/notes"
import { memo, useCallback, useEffect, useMemo } from "react"

import { useEmbeddingTasks } from "@/context/embedding"

/**
 * Component that manages embedding tasks polling.
 * This is a "headless" component that doesn't render anything.
 */
export const NoteEmbeddingProcessor = memo(function NoteEmbeddingProcessor() {
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
  const taskPollers = useMemo(() => {
    if (pendingTaskIds.length === 0) {
      return null // Return null if there are no pending tasks
    }

    return pendingTaskIds.map((taskId) => (
      <NoteEmbeddingTaskPoller
        key={taskId}
        taskId={taskId}
        onComplete={() => handleTaskComplete(taskId)}
      />
    ))
  }, [pendingTaskIds, handleTaskComplete])

  // Return the task pollers only if there are tasks to poll
  return <>{taskPollers}</>
})

interface NoteEmbeddingTaskPollerProps {
  taskId: string
  onComplete: () => void
}

/**
 * Component that polls a single embedding task
 */
const NoteEmbeddingTaskPoller = memo(function NoteEmbeddingTaskPoller({
  taskId,
  onComplete,
}: NoteEmbeddingTaskPollerProps) {
  // Use the hook to poll this task, but only if we have a valid taskId
  const { data, isSuccess, isError } = useQueryNoteEmbeddingStatus(taskId)

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
