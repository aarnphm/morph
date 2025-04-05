"use client"

import * as React from "react"
import { createContext, useCallback, useContext, useReducer } from "react"

// Define loading state interface
interface LoadingState {
  isNotesLoading: boolean
  isNotesRecentlyGenerated: boolean
}

// Define action types
type LoadingAction =
  | { type: "SET_NOTES_LOADING"; payload: boolean }
  | { type: "SET_NOTES_RECENTLY_GENERATED"; payload: boolean }
  | { type: "RESET_ALL" }

// Define reducer function
function loadingReducer(state: LoadingState, action: LoadingAction): LoadingState {
  switch (action.type) {
    case "SET_NOTES_LOADING":
      return { ...state, isNotesLoading: action.payload }
    case "SET_NOTES_RECENTLY_GENERATED":
      return { ...state, isNotesRecentlyGenerated: action.payload }
    case "RESET_ALL":
      return { ...initialLoadingState }
    default:
      return state
  }
}

// Initial state
const initialLoadingState: LoadingState = {
  isNotesLoading: false,
  isNotesRecentlyGenerated: true,
}

// Define context type
interface LoadingContextType {
  state: LoadingState
  setNotesLoading: (isLoading: boolean) => void
  setNotesRecentlyGenerated: (isRecentlyGenerated: boolean) => void
  resetLoadingState: () => void
}

// Create context
const LoadingContext = createContext<LoadingContextType | null>(null)

// Provider props
interface LoadingProviderProps {
  children: React.ReactNode
}

// Create provider component
export function LoadingProvider({ children }: LoadingProviderProps) {
  const [state, dispatch] = useReducer(loadingReducer, initialLoadingState)

  // Action dispatchers
  const setNotesLoading = useCallback((isLoading: boolean) => {
    dispatch({ type: "SET_NOTES_LOADING", payload: isLoading })
  }, [])

  const setNotesRecentlyGenerated = useCallback((isRecentlyGenerated: boolean) => {
    dispatch({ type: "SET_NOTES_RECENTLY_GENERATED", payload: isRecentlyGenerated })
  }, [])

  const resetLoadingState = useCallback(() => {
    dispatch({ type: "RESET_ALL" })
  }, [])

  // Create memoized value
  const value = React.useMemo(
    () => ({
      state,
      setNotesLoading,
      setNotesRecentlyGenerated,
      resetLoadingState,
    }),
    [state, setNotesLoading, setNotesRecentlyGenerated, resetLoadingState]
  )

  return <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
}

// Create hook for consuming the context
export function useLoading() {
  const context = useContext(LoadingContext)
  if (context === null) {
    throw new Error("useLoading must be used within a LoadingProvider")
  }
  return context
}
