import { useQueryAuthorStatus } from "@/services/authors"
import { useEffect } from "react"

import { useAuthorTasks } from "@/context/authors"

export function AuthorProcessor() {
  const { pendingTaskIds, getFileIdForTask, removeTask } = useAuthorTasks()

  // Process each pending task in parallel with separate queries
  return (
    <>
      {pendingTaskIds.map((taskId) => (
        <AuthorTaskProcessor
          key={taskId}
          taskId={taskId}
          fileId={getFileIdForTask(taskId)}
          onComplete={removeTask}
        />
      ))}
    </>
  )
}

function AuthorTaskProcessor({
  taskId,
  fileId,
  onComplete,
}: {
  taskId: string
  fileId: string
  onComplete: (taskId: string) => void
}) {
  // Use the query hook to poll the task status
  const { data, isError } = useQueryAuthorStatus(taskId, fileId)

  // When the task completes (success or failure), remove it from pending tasks
  useEffect(() => {
    if (!data) return

    const isComplete =
      data.status === "success" || data.status === "failure" || data.status === "cancelled"

    if (isComplete) {
      onComplete(taskId)
    }
  }, [data, taskId, onComplete])

  // If there's an error, also remove the task
  useEffect(() => {
    if (isError) {
      onComplete(taskId)
    }
  }, [isError, taskId, onComplete])

  // This component doesn't render anything visible
  return null
}
