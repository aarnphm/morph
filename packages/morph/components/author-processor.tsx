import { useQueryAuthorStatus } from "@/services/authors"
import { useCallback, useEffect, memo } from "react"
import { PgliteDatabase } from "drizzle-orm/pglite"

import { useAuthorTasks } from "@/context/authors"

import * as schema from "@/db/schema"

export const AuthorProcessor = memo(function AuthorProcessor({
  db,
}: {
  db: PgliteDatabase<typeof schema>
}) {
  const { pendingTaskIds, getFileIdForTask, removeTask } = useAuthorTasks()

  // Memoize the removeTask callback to prevent unnecessary rerenders
  const handleTaskComplete = useCallback(
    (taskId: string) => {
      removeTask(taskId)
    },
    [removeTask]
  )

  // Create a memoized component factory function for task processors
  const TaskProcessors = useCallback(() => {
    if (pendingTaskIds.length === 0) return null

    return pendingTaskIds.map((taskId) => (
      <AuthorTaskProcessor
        key={taskId}
        taskId={taskId}
        fileId={getFileIdForTask(taskId)}
        db={db}
        onComplete={() => handleTaskComplete(taskId)}
      />
    ))
  }, [pendingTaskIds, getFileIdForTask, handleTaskComplete, db])

  // Return the task processors
  return <TaskProcessors />
})

function AuthorTaskProcessor({
  taskId,
  fileId,
  db,
  onComplete,
}: {
  taskId: string
  fileId: string
  db: PgliteDatabase<typeof schema>
  onComplete: (taskId: string) => void
}) {
  // Use the query hook to poll the task status
  const { data, isSuccess, isError } = useQueryAuthorStatus(taskId, fileId, db)

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
      onComplete(taskId)
    }
  }, [isSuccess, isError, data, taskId, onComplete])

  // This component doesn't render anything visible
  return null
}
