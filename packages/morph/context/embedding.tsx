import React, {
  Dispatch,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useReducer,
} from "react"

// STATE MANAGEMENT FOR NOTE EMBEDDINGS (existing code)
type EmbeddingTasksState = {
  pendingTaskIds: string[]
}

type EmbeddingTasksAction =
  | { type: "ADD_TASK"; taskId: string }
  | { type: "REMOVE_TASK"; taskId: string }
  | { type: "CLEAR_TASKS" }

const initialEmbeddingTasksState: EmbeddingTasksState = {
  pendingTaskIds: [],
}

const EmbeddingTasksStateContext = createContext<EmbeddingTasksState | undefined>(undefined)
const EmbeddingTasksDispatchContext = createContext<Dispatch<EmbeddingTasksAction> | undefined>(
  undefined,
)

function embeddingTasksReducer(
  state: EmbeddingTasksState,
  action: EmbeddingTasksAction,
): EmbeddingTasksState {
  switch (action.type) {
    case "ADD_TASK": {
      // Only add the task if it's not already in the list
      if (state.pendingTaskIds.includes(action.taskId)) {
        return state
      }
      return {
        ...state,
        pendingTaskIds: [...state.pendingTaskIds, action.taskId],
      }
    }
    case "REMOVE_TASK": {
      return {
        ...state,
        pendingTaskIds: state.pendingTaskIds.filter((id) => id !== action.taskId),
      }
    }
    case "CLEAR_TASKS": {
      return {
        ...state,
        pendingTaskIds: [],
      }
    }
    default: {
      return state
    }
  }
}

// STATE MANAGEMENT FOR ESSAY EMBEDDINGS (new code)
type EssayEmbeddingTasksState = {
  pendingTaskIds: string[]
}

type EssayEmbeddingTasksAction =
  | { type: "ADD_TASK"; taskId: string }
  | { type: "REMOVE_TASK"; taskId: string }
  | { type: "CLEAR_TASKS" }

const initialEssayEmbeddingTasksState: EssayEmbeddingTasksState = {
  pendingTaskIds: [],
}

const EssayEmbeddingTasksStateContext = createContext<EssayEmbeddingTasksState | undefined>(
  undefined,
)
const EssayEmbeddingTasksDispatchContext = createContext<
  Dispatch<EssayEmbeddingTasksAction> | undefined
>(undefined)

function essayEmbeddingTasksReducer(
  state: EssayEmbeddingTasksState,
  action: EssayEmbeddingTasksAction,
): EssayEmbeddingTasksState {
  switch (action.type) {
    case "ADD_TASK": {
      // Only add the task if it's not already in the list
      if (state.pendingTaskIds.includes(action.taskId)) {
        return state
      }
      return {
        ...state,
        pendingTaskIds: [...state.pendingTaskIds, action.taskId],
      }
    }
    case "REMOVE_TASK": {
      return {
        ...state,
        pendingTaskIds: state.pendingTaskIds.filter((id) => id !== action.taskId),
      }
    }
    case "CLEAR_TASKS": {
      return {
        ...state,
        pendingTaskIds: [],
      }
    }
    default: {
      return state
    }
  }
}

// PROVIDER COMPONENTS

export function EmbeddingTasksProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(embeddingTasksReducer, initialEmbeddingTasksState)

  return (
    <EmbeddingTasksStateContext.Provider value={state}>
      <EmbeddingTasksDispatchContext.Provider value={dispatch}>
        {children}
      </EmbeddingTasksDispatchContext.Provider>
    </EmbeddingTasksStateContext.Provider>
  )
}

export function EssayEmbeddingTasksProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(essayEmbeddingTasksReducer, initialEssayEmbeddingTasksState)

  return (
    <EssayEmbeddingTasksStateContext.Provider value={state}>
      <EssayEmbeddingTasksDispatchContext.Provider value={dispatch}>
        {children}
      </EssayEmbeddingTasksDispatchContext.Provider>
    </EssayEmbeddingTasksStateContext.Provider>
  )
}

// CONTEXT HOOKS FOR NOTE EMBEDDINGS (existing, renamed for clarity)
function useEmbeddingTasksState() {
  const context = useContext(EmbeddingTasksStateContext)
  if (context === undefined) {
    throw new Error("useEmbeddingTasksState must be used within an EmbeddingTasksProvider")
  }
  return context
}

function useEmbeddingTasksDispatch() {
  const context = useContext(EmbeddingTasksDispatchContext)
  if (context === undefined) {
    throw new Error("useEmbeddingTasksDispatch must be used within an EmbeddingTasksProvider")
  }
  return context
}

export function useEmbeddingTasks() {
  const state = useEmbeddingTasksState()
  const dispatch = useEmbeddingTasksDispatch()

  // Create action handlers
  const addTask = useCallback(
    (taskId: string) => {
      dispatch({ type: "ADD_TASK", taskId })
    },
    [dispatch],
  )

  const removeTask = useCallback(
    (taskId: string) => {
      dispatch({ type: "REMOVE_TASK", taskId })
    },
    [dispatch],
  )

  const clearTasks = useCallback(() => {
    dispatch({ type: "CLEAR_TASKS" })
  }, [dispatch])

  return {
    pendingTaskIds: state.pendingTaskIds,
    addTask,
    removeTask,
    clearTasks,
  }
}

// CONTEXT HOOKS FOR ESSAY EMBEDDINGS (new)
function useEssayEmbeddingTasksState() {
  const context = useContext(EssayEmbeddingTasksStateContext)
  if (context === undefined) {
    throw new Error(
      "useEssayEmbeddingTasksState must be used within an EssayEmbeddingTasksProvider",
    )
  }
  return context
}

function useEssayEmbeddingTasksDispatch() {
  const context = useContext(EssayEmbeddingTasksDispatchContext)
  if (context === undefined) {
    throw new Error(
      "useEssayEmbeddingTasksDispatch must be used within an EssayEmbeddingTasksProvider",
    )
  }
  return context
}

export function useEssayEmbeddingTasks() {
  const state = useEssayEmbeddingTasksState()
  const dispatch = useEssayEmbeddingTasksDispatch()

  // Create action handlers
  const addTask = useCallback(
    (taskId: string) => {
      dispatch({ type: "ADD_TASK", taskId })
    },
    [dispatch],
  )

  const removeTask = useCallback(
    (taskId: string) => {
      dispatch({ type: "REMOVE_TASK", taskId })
    },
    [dispatch],
  )

  const clearTasks = useCallback(() => {
    dispatch({ type: "CLEAR_TASKS" })
  }, [dispatch])

  return {
    pendingTaskIds: state.pendingTaskIds,
    addTask,
    removeTask,
    clearTasks,
  }
}

// COMBINED PROVIDER
export function EmbeddingProvider({ children }: { children: ReactNode }) {
  return (
    <EmbeddingTasksProvider>
      <EssayEmbeddingTasksProvider>{children}</EssayEmbeddingTasksProvider>
    </EmbeddingTasksProvider>
  )
}
