export const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || "http://localhost:8000"
export const POLLING_INTERVAL = 3000 // 3 seconds
export const ESAAY_POLLING_INTERVAL = 12000 // 12 seconds

// Types based on OpenAPI spec
export interface TaskStatusResponse {
  task_id: string
  status: "in_progress" | "success" | "failure" | "cancelled"
  created_at: string
  executed_at: string | null
}
