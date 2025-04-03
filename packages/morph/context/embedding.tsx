import React, { createContext, useReducer, useContext, ReactNode, useCallback } from 'react'

// Define the state type
interface EmbeddingTasksState {
  pendingTaskIds: string[]
}

// Define action types
type EmbeddingTaskAction =
  | { type: 'ADD_TASK', taskId: string }
  | { type: 'REMOVE_TASK', taskId: string }
  | { type: 'CLEAR_TASKS' }

// Create the initial state
const initialState: EmbeddingTasksState = {
  pendingTaskIds: []
}

// Create the reducer
function embeddingTasksReducer(state: EmbeddingTasksState, action: EmbeddingTaskAction): EmbeddingTasksState {
  switch (action.type) {
    case 'ADD_TASK':
      // Only add if it doesn't already exist
      if (state.pendingTaskIds.includes(action.taskId)) {
        return state
      }
      return {
        ...state,
        pendingTaskIds: [...state.pendingTaskIds, action.taskId]
      }
    case 'REMOVE_TASK':
      return {
        ...state,
        pendingTaskIds: state.pendingTaskIds.filter(id => id !== action.taskId)
      }
    case 'CLEAR_TASKS':
      return {
        ...state,
        pendingTaskIds: []
      }
    default:
      return state
  }
}

// Create a context for the state
const EmbeddingTasksStateContext = createContext<EmbeddingTasksState | undefined>(undefined)

// Create a context for the dispatch function
type EmbeddingTasksDispatch = React.Dispatch<EmbeddingTaskAction>
const EmbeddingTasksDispatchContext = createContext<EmbeddingTasksDispatch | undefined>(undefined)

// Create the provider component
interface EmbeddingTasksProviderProps {
  children: ReactNode
}

export function EmbeddingTasksProvider({ children }: EmbeddingTasksProviderProps) {
  const [state, dispatch] = useReducer(embeddingTasksReducer, initialState)

  return (
    <EmbeddingTasksStateContext.Provider value={state}>
      <EmbeddingTasksDispatchContext.Provider value={dispatch}>
        {children}
      </EmbeddingTasksDispatchContext.Provider>
    </EmbeddingTasksStateContext.Provider>
  )
}

// Custom hooks to use the contexts
export function useEmbeddingTasksState() {
  const context = useContext(EmbeddingTasksStateContext)
  if (context === undefined) {
    throw new Error('useEmbeddingTasksState must be used within an EmbeddingTasksProvider')
  }
  return context
}

export function useEmbeddingTasksDispatch() {
  const context = useContext(EmbeddingTasksDispatchContext)
  if (context === undefined) {
    throw new Error('useEmbeddingTasksDispatch must be used within an EmbeddingTasksProvider')
  }
  return context
}

// Convenience hook that provides both state and actions
export function useEmbeddingTasks() {
  const state = useEmbeddingTasksState()
  const dispatch = useEmbeddingTasksDispatch()

  // Create action handlers
  const addTask = useCallback((taskId: string) => {
    dispatch({ type: 'ADD_TASK', taskId })
  }, [dispatch])

  const removeTask = useCallback((taskId: string) => {
    dispatch({ type: 'REMOVE_TASK', taskId })
  }, [dispatch])

  const clearTasks = useCallback(() => {
    dispatch({ type: 'CLEAR_TASKS' })
  }, [dispatch])

  return {
    pendingTaskIds: state.pendingTaskIds,
    addTask,
    removeTask,
    clearTasks
  }
}
