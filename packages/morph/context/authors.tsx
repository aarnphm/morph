import React, {
  Dispatch,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useReducer,
} from "react"

// STATE MANAGEMENT FOR AUTHOR RECOMMENDATIONS
type AuthorTasksState = {
  pendingTasks: Record<string, string> // Maps taskId to fileId
}

type AuthorTasksAction =
  | { type: "ADD_TASK"; taskId: string; fileId: string }
  | { type: "REMOVE_TASK"; taskId: string }
  | { type: "CLEAR_TASKS" }

const initialAuthorTasksState: AuthorTasksState = {
  pendingTasks: {},
}

const AuthorTasksStateContext = createContext<AuthorTasksState | undefined>(undefined)
const AuthorTasksDispatchContext = createContext<Dispatch<AuthorTasksAction> | undefined>(undefined)

function authorTasksReducer(state: AuthorTasksState, action: AuthorTasksAction): AuthorTasksState {
  switch (action.type) {
    case "ADD_TASK": {
      // Only add the task if it's not already in the list
      if (state.pendingTasks[action.taskId]) {
        return state
      }
      return {
        ...state,
        pendingTasks: {
          ...state.pendingTasks,
          [action.taskId]: action.fileId,
        },
      }
    }
    case "REMOVE_TASK": {
      const { [action.taskId]: _, ...restTasks } = state.pendingTasks
      return {
        ...state,
        pendingTasks: restTasks,
      }
    }
    case "CLEAR_TASKS": {
      return {
        ...state,
        pendingTasks: {},
      }
    }
    default: {
      return state
    }
  }
}

// PROVIDER COMPONENT
export function AuthorTasksProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authorTasksReducer, initialAuthorTasksState)

  return (
    <AuthorTasksStateContext.Provider value={state}>
      <AuthorTasksDispatchContext.Provider value={dispatch}>
        {children}
      </AuthorTasksDispatchContext.Provider>
    </AuthorTasksStateContext.Provider>
  )
}

// CONTEXT HOOKS
function useAuthorTasksState() {
  const context = useContext(AuthorTasksStateContext)
  if (context === undefined) {
    throw new Error("useAuthorTasksState must be used within an AuthorTasksProvider")
  }
  return context
}

function useAuthorTasksDispatch() {
  const context = useContext(AuthorTasksDispatchContext)
  if (context === undefined) {
    throw new Error("useAuthorTasksDispatch must be used within an AuthorTasksProvider")
  }
  return context
}

export function useAuthorTasks() {
  const state = useAuthorTasksState()
  const dispatch = useAuthorTasksDispatch()

  // Create action handlers
  const addTask = useCallback(
    (taskId: string, fileId: string) => {
      dispatch({ type: "ADD_TASK", taskId, fileId })
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
    pendingTasks: state.pendingTasks,
    pendingTaskIds: Object.keys(state.pendingTasks),
    getFileIdForTask: (taskId: string) => state.pendingTasks[taskId],
    addTask,
    removeTask,
    clearTasks,
  }
}
