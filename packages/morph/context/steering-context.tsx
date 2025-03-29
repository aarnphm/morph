"use client"

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react"

// Default steering parameters
export const DEFAULT_AUTHORS = [
  "Raymond Carver",
  "Franz Kafka",
  "Albert Camus",
  "Iain McGilchrist",
  "Ian McEwan",
]

// TODO: extrapolate features based on tonality
export const DEFAULT_TONALITY = {
  formal: 0,
  fun: 0,
  "soul-cartographer": 0,
  logics: 0,
}

export const DEFAULT_TEMPERATURE = 0.6
export const DEFAULT_NUM_SUGGESTIONS = 4

export interface SteeringSettings {
  authors: string[]
  tonality: Record<string, number>
  temperature: number
  numSuggestions: number
  tonalityEnabled: boolean
}

interface SteeringContextType {
  settings: SteeringSettings
  updateAuthors: (authors: string[]) => void
  updateTonality: (tonality: Record<string, number>) => void
  updateTemperature: (temperature: number) => void
  updateNumSuggestions: (numSuggestions: number) => void
  toggleTonality: (enabled: boolean) => void
}

const SteeringContext = createContext<SteeringContextType | null>(null)

interface SteeringProviderProps {
  children: ReactNode
}

export function SteeringProvider({ children }: SteeringProviderProps) {
  const [settings, setSettings] = useState<SteeringSettings>({
    authors: [...DEFAULT_AUTHORS], // Create a new array to avoid reference issues
    tonality: { ...DEFAULT_TONALITY }, // Create a new object to avoid reference issues
    temperature: DEFAULT_TEMPERATURE,
    numSuggestions: DEFAULT_NUM_SUGGESTIONS,
    tonalityEnabled: false,
  })

  const updateSettings = useCallback(
    <K extends keyof SteeringSettings>(key: K, value: SteeringSettings[K]) => {
      setSettings((prev) => {
        // Always create a new object with spread to ensure reference equality changes
        const newSettings = { ...prev };

        // Special handling for object and array types to ensure new references
        if (key === 'authors' && Array.isArray(value)) {
          newSettings[key] = [...value] as SteeringSettings[K];
        } else if (key === 'tonality' && typeof value === 'object') {
          newSettings[key] = { ...value } as SteeringSettings[K];
        } else {
          newSettings[key] = value;
        }
        return newSettings;
      });
    },
    [],
  )

  const updateAuthors = useCallback(
    (authors: string[]) => {
      updateSettings("authors", authors)
    },
    [updateSettings],
  )

  const updateTonality = useCallback(
    (tonality: Record<string, number>) => {
      updateSettings("tonality", tonality)
    },
    [updateSettings],
  )

  const updateTemperature = useCallback(
    (temperature: number) => {
      updateSettings("temperature", temperature)
    },
    [updateSettings],
  )

  const updateNumSuggestions = useCallback(
    (numSuggestions: number) => {
      updateSettings("numSuggestions", numSuggestions)
    },
    [updateSettings],
  )

  const toggleTonality = useCallback(
    (enabled: boolean) => {
      updateSettings("tonalityEnabled", enabled)
    },
    [updateSettings],
  )

  const value = {
    settings,
    updateAuthors,
    updateTonality,
    updateTemperature,
    updateNumSuggestions,
    toggleTonality,
  }

  return <SteeringContext.Provider value={value}>{children}</SteeringContext.Provider>
}

export function useSteeringContext() {
  const context = useContext(SteeringContext)
  if (context === null) {
    throw new Error("useSteeringContext must be used within a SteeringProvider")
  }
  return context
}
