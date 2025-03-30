"use client"

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { getPgLiteInstance } from '@/lib/pglite'
import { useToast } from '@/hooks/use-toast'

// Define the context type
interface PgLiteContextType {
  isInitialized: boolean
  isLoading: boolean
  error: Error | null
  instance: any | null
}

// Create the context with default values
const PgLiteContext = createContext<PgLiteContextType>({
  isInitialized: false,
  isLoading: true,
  error: null,
  instance: null
})

// Custom hook to access the context
export const usePgLite = () => useContext(PgLiteContext)

export const PgLiteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PgLiteContextType>({
    isInitialized: false,
    isLoading: true,
    error: null,
    instance: null
  })
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()
  const initAttemptRef = useRef(0)

  // Initialize PGLite - using a single async function with timeout
  // instead of IIFE for better clarity and control
  useEffect(() => {
    // Skip if already initialized or currently initializing
    if (state.isInitialized || initTimeoutRef.current) {
      return
    }

    // Cap initialization attempts
    if (initAttemptRef.current > 2) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: new Error("Failed to initialize PGLite after multiple attempts")
      }))
      return
    }

    initAttemptRef.current += 1

    // Set a timeout to allow any React effects to settle
    // This helps prevent multiple rapid initialization attempts
    initTimeoutRef.current = setTimeout(async () => {
      try {
        console.debug("PGLite context initializing...")
        const instance = await getPgLiteInstance()

        setState({
          isInitialized: true,
          isLoading: false,
          error: null,
          instance
        })
        console.debug("PGLite context initialization successful")
      } catch (error) {
        console.error("PGLite context initialization failed:", error)
        setState({
          isInitialized: false,
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
          instance: null
        })

        // Show toast error only on real failures (not during development remounting)
        if (initAttemptRef.current > 1) {
          toast({
            title: "Database Error",
            description: "Could not initialize the local embedding database.",
            variant: "destructive",
          })
        }
      } finally {
        initTimeoutRef.current = null
      }
    }, 100) // Short delay to prevent rapid re-initialization

    // Cleanup function
    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current)
        initTimeoutRef.current = null
      }
    }
  }, [toast]) // Only re-run if toast changes

  // Add an effect to handle cleanup on window unload events
  useEffect(() => {
    // Function to handle unload events
    const handleUnload = () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current)
        initTimeoutRef.current = null
      }
    }

    // Add listener for unload events
    window.addEventListener('beforeunload', handleUnload)

    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current)
        initTimeoutRef.current = null
      }
    }
  }, []) // Empty deps - only run once on mount/unmount

  return (
    <PgLiteContext.Provider value={state}>
      {children}
    </PgLiteContext.Provider>
  )
}
