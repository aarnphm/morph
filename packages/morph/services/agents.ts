import { API_ENDPOINT } from "@/services/constants"
import axios, { AxiosResponse } from "axios"

// Interfaces
export interface SuggestionRequest {
  essay: string
  authors?: string[]
  notes?: {
    vault_id: string
    file_id: string
    note_id: string
    content: string
  }[]
  tonality?: { [key: string]: number }
  num_suggestions?: number
  temperature?: number
  max_tokens?: number
  usage?: boolean
}

export interface SuggestionResponse {
  suggestions: { suggestion: string }[]
}

export interface StreamingNote {
  id: string
  content: string
  color: string
  isComplete: boolean
  isScanComplete: boolean
}

export interface ReadinessResponse {
  healthy: boolean
  services: { name: string; healthy: boolean; latency_ms: number; error: string }[]
  timestamp: string
}

export interface GeneratedNote {
  content: string
}

export interface NewlyGeneratedNotes {
  generatedNotes: GeneratedNote[]
  reasoningId: string
  reasoningElapsedTime: number
  reasoningContent: string
}

export interface StreamingCallbacks {
  onReasoningUpdate: (reasoning: string) => void
  onReasoningComplete: (complete: boolean) => void
  onElapsedTimeUpdate: (time: number) => void
  onStreamingNotesUpdate: (notes: StreamingNote[]) => void
  onScanAnimationComplete: () => void
  onError: (error: string) => void
}

/**
 * Checks if the agent API is available
 */
export async function checkAgentAvailability(): Promise<boolean> {
  return await axios
    .get(`${API_ENDPOINT}/readyz`)
    .then((resp) => resp.status === 200)
    .catch((err) => {
      console.error("Error checking agent availability:", err)
      return false
    })
}

/**
 * Checks the health of the agent API
 */
export async function checkAgentHealth(timeout: number = 30): Promise<ReadinessResponse> {
  return await axios
    .post<{ timeout: number }, AxiosResponse<ReadinessResponse>>(`${API_ENDPOINT}/health`, {
      timeout,
    })
    .then((response) => response.data)
    .catch((err) => {
      console.error("Services aren't ready:", err)
      throw err
    })
}
