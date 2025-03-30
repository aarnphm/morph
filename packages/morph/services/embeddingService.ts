import { type Note, db } from "@/db";
import { md } from "@/components/parser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { saveNoteEmbedding, saveEssayEmbedding } from "@/lib/pglite";

// --- Constants ---
const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || "http://localhost:8000";
const POLLING_INTERVAL = 5000; // 5 seconds for notes
const ESSAY_POLLING_INTERVAL = 10000; // 10 seconds for essays

// --- Types (Copied from editor.tsx or derived) ---
export interface TaskStatusResponse {
  task_id: string;
  status: "in_progress" | "success" | "failure" | "cancelled";
  created_at: string;
  executed_at: string | null;
}

export enum EmbedType {
  ESSAY = 1,
  NOTE = 2, // Adjusted value for clarity, ensure backend matches if necessary
}

export interface EmbedMetadata {
  vault: string;
  file: string;
  type: EmbedType;
  note?: string | null; // Note ID if type is NOTE
  node_ids?: string[] | null; // Chunk IDs if type is ESSAY
}

export interface EmbedTaskResult {
  metadata: EmbedMetadata;
  embedding: number[][]; // Expecting list of embeddings (one for note, multiple for essay chunks)
  error?: string;
}

interface NoteSubmitPayload {
  note: {
    vault_id: string;
    file_id: string;
    note_id: string;
    content: string;
  };
}

interface EssaySubmitPayload {
  essay: {
    vault_id: string;
    file_id: string;
    content: string; // Raw markdown content for essay
  };
}

// --- Base API Fetch Functions ---

/**
 * Gets the API endpoint, ensuring it's accessible.
 */
const getApiEndpoint = (): string => {
  if (!API_ENDPOINT) {
    throw new Error("API endpoint is not configured. Check NEXT_PUBLIC_API_ENDPOINT.");
  }
  return API_ENDPOINT;
};

/**
 * Submits a task for embedding a single note.
 */
export const submitNoteEmbeddingTask = async (note: Note): Promise<TaskStatusResponse> => {
  const endpoint = getApiEndpoint();
  const payload: NoteSubmitPayload = {
    note: {
      vault_id: note.vaultId,
      file_id: note.fileId,
      note_id: note.id,
      content: note.content,
    },
  };

  const response = await fetch(`${endpoint}/notes/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error(`Failed to submit note embedding task ${note.id}:`, response.status, errorData);
    throw new Error(`Failed to submit note embedding task: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Submits a task for embedding an essay.
 */
export const submitEssayEmbeddingTask = async (
  vaultId: string,
  fileId: string,
  content: string,
): Promise<TaskStatusResponse> => {
  const endpoint = getApiEndpoint();
  const payload: EssaySubmitPayload = {
    essay: {
      vault_id: vaultId,
      file_id: fileId,
      content: md(content).content, // Extract content from markdown
    },
  };

  const response = await fetch(`${endpoint}/essays/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error(`Failed to submit essay embedding task ${vaultId}/${fileId}:`, response.status, errorData);
    throw new Error(`Failed to submit essay embedding task: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Gets the status of an embedding task (note or essay).
 */
export const getEmbeddingTaskStatus = async (
  taskId: string,
  type: "note" | "essay",
): Promise<TaskStatusResponse> => {
  const endpoint = getApiEndpoint();
  const url = `${endpoint}/${type === "note" ? "notes" : "essays"}/status?task_id=${taskId}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error(`Failed to get ${type} task status ${taskId}:`, response.status, errorData);
    // Allow specific error handling upstream by not throwing generic error here
    // Let TanStack Query handle the error state based on the response
    // throw new Error(`Failed to get ${type} task status: ${response.statusText}`);
    const error = new Error(`Failed to get ${type} task status: ${response.statusText}`) as any;
    error.response = response;
    error.data = errorData;
    throw error;
  }

  return response.json();
};

/**
 * Gets the result of a completed embedding task (note or essay).
 */
export const getEmbeddingResult = async (
  taskId: string,
  type: "note" | "essay",
): Promise<EmbedTaskResult> => {
  const endpoint = getApiEndpoint();
  const url = `${endpoint}/${type === "note" ? "notes" : "essays"}/get?task_id=${taskId}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error(`Failed to get ${type} embedding result ${taskId}:`, response.status, errorData);
    // Allow specific error handling upstream
    // throw new Error(`Failed to get ${type} embedding result: ${response.statusText}`);
    const error = new Error(`Failed to get ${type} embedding result: ${response.statusText}`) as any;
    error.response = response;
    error.data = errorData;
    throw error;
  }

  return response.json();
};

// --- TanStack Query Hooks (to be implemented next) ---

// TODO: Implement useSubmitEmbedding hook
// TODO: Implement usePollEmbeddingStatus hook (or similar polling logic with useQuery)

// --- TanStack Query Hooks ---

// Type for submission input
type SubmitNoteInput = { type: "note"; note: Note };
type SubmitEssayInput = { type: "essay"; vaultId: string; fileId: string; content: string };
type SubmitEmbeddingInput = SubmitNoteInput | SubmitEssayInput;

/**
 * Hook to submit an embedding task (note or essay).
 */
export const useSubmitEmbedding = () => {
  const queryClient = useQueryClient();

  return useMutation<TaskStatusResponse, Error, SubmitEmbeddingInput>({
    mutationFn: async (input: SubmitEmbeddingInput) => {
      if (input.type === "note") {
        return submitNoteEmbeddingTask(input.note);
      } else {
        return submitEssayEmbeddingTask(input.vaultId, input.fileId, input.content);
      }
    },
    onSuccess: (data, variables) => {
      console.debug(`Embedding task ${data.task_id} submitted successfully for ${variables.type}.`);
      // Invalidate relevant queries or trigger polling if needed
      // Polling will be handled by usePollEmbeddingStatus based on Dexie state
      queryClient.invalidateQueries({ queryKey: ["embeddingStatus", variables.type] });
    },
    onError: (error, variables) => {
      console.error(`Error submitting ${variables.type} embedding task:`, error);
      // Error handling (e.g., toast) should ideally happen in the component
    },
  });
};

interface UsePollEmbeddingStatusProps {
  taskId: string | undefined | null;
  type: "note" | "essay";
  noteId?: string; // Only for note type
  vaultId?: string; // Only for essay type
  fileId?: string; // Only for essay type
  onSuccessCallback?: (result: EmbedTaskResult) => Promise<void> | void; // Optional callback on successful embedding retrieval
  onErrorCallback?: (error: Error) => void;
  enabled?: boolean; // Control whether polling is active
}

/**
 * Hook to poll the status of an embedding task and retrieve the result upon success.
 */
export const usePollEmbeddingStatus = ({
  taskId,
  type,
  noteId,
  vaultId,
  fileId,
  onSuccessCallback,
  onErrorCallback,
  enabled = true,
}: UsePollEmbeddingStatusProps) => {
  const queryClient = useQueryClient();

  return useQuery<TaskStatusResponse, Error, TaskStatusResponse & { finalResult?: EmbedTaskResult }>({
    queryKey: ["embeddingStatus", type, taskId], // Unique key for this task
    queryFn: async () => {
      if (!taskId) throw new Error("Task ID is required for polling.");

      const statusData = await getEmbeddingTaskStatus(taskId, type);

      if (statusData.status === "success") {
        try {
          console.debug(`Task ${taskId} succeeded. Fetching result...`);
          const resultData = await getEmbeddingResult(taskId, type);
          // Attach the final result to the returned data
          return { ...statusData, finalResult: resultData };
        } catch (error) {
          console.error(`Failed to fetch result for successful task ${taskId}:`, error);
          // Treat result fetch failure as overall failure for this poll cycle
          throw error; // Let onError handle this
        }
      }

      // Return status data if not success (in_progress, failure, cancelled)
      return { ...statusData, finalResult: undefined }; // Ensure finalResult is always potentially present
    },
    enabled: !!taskId && enabled, // Only run if taskId is provided and enabled is true
    refetchInterval: (query) => {
      // Only poll if status is 'in_progress'
      // Use query.state.data, not data directly in this function context
      if (query.state.data?.status === "in_progress") {
        return type === "note" ? POLLING_INTERVAL : ESSAY_POLLING_INTERVAL;
      }
      return false; // Stop polling otherwise
    },
    refetchIntervalInBackground: false, // Don't poll if window/tab is not focused
    refetchOnWindowFocus: false, // Avoid re-polling on focus if status is terminal
    retry: (failureCount, error: any) => {
      // Don't retry on 4xx errors (e.g., task not found)
      if (error?.response?.status >= 400 && error?.response?.status < 500) {
        return false;
      }
      // Retry up to 3 times on other errors (e.g., network, 5xx)
      return failureCount < 3;
    },
    gcTime: Infinity, // Keep data indefinitely until manually invalidated or task completes
    // Consider a shorter gcTime if tasks can become stale and unrecoverable
    // gcTime: 1000 * 60 * 5, // Example: 5 minutes

    staleTime: POLLING_INTERVAL / 2, // Consider status fresh for half the polling interval

    // --- NEW: Handling side effects on success/error ---
    onSuccess: (data) => {
       // This runs after a successful queryFn execution
       if (data.status === "success" && data.finalResult) {
           console.debug(`Polling success for ${type} task ${taskId}, result received.`);
           onSuccessCallback?.(data.finalResult);
       } else if (data.status === "failure" || data.status === "cancelled") {
           // Handle terminal states other than success if needed, though errors are caught by onError
           console.warn(`Polling complete for ${type} task ${taskId}, status: ${data.status}.`);
           // Optionally call a generic completion callback or specific failure/cancelled callback
            // Triggering onErrorCallback here for consistency if a specific error wasn't thrown
           // but the task ended in failure/cancelled according to the status endpoint.
           if (data.status === "failure" || data.status === "cancelled") {
                const error = new Error(`Task ${taskId} ended with status: ${data.status}`);
                onErrorCallback?.(error);
           }
       } else {
            console.debug(`Polling update for ${type} task ${taskId}, status: ${data.status}.`);
       }
    },
    onError: (error) => {
        // This runs if the queryFn throws an error (network, fetch error, etc.)
        console.error(`Polling error for ${type} task ${taskId}:`, error);
        onErrorCallback?.(error);
    },

    meta: {
      // Example of using meta for error messages, though often handled in component
      errorMessage: `Failed to poll status for ${type} task ${taskId}`,
    },
  });
};
