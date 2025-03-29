"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { ChevronLeftIcon, MixerHorizontalIcon } from "@radix-ui/react-icons"
import { cn } from "@/lib"
import {
  AuthorsSelector,
  TonalityRadar,
  TemperatureSlider,
  SuggestionsSlider,
} from "@/components/steering"
import {
  DEFAULT_AUTHORS,
  DEFAULT_TONALITY,
  DEFAULT_TEMPERATURE,
  DEFAULT_NUM_SUGGESTIONS,
} from "@/components/steering/constants"
import { VaultButton } from "@/components/ui/button"

interface SteeringPanelProps {
  fileId: string
  onSettingsChange: (settings: SteeringSettings) => void
  className?: string
}

export interface SteeringSettings {
  authors: string[]
  tonality: Record<string, number>
  temperature: number
  numSuggestions: number
  tonalityEnabled: boolean
}

export default function SteeringPanel({ fileId, onSettingsChange, className }: SteeringPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [settings, setSettings] = useState<SteeringSettings>({
    authors: DEFAULT_AUTHORS,
    tonality: DEFAULT_TONALITY,
    temperature: DEFAULT_TEMPERATURE,
    numSuggestions: DEFAULT_NUM_SUGGESTIONS,
    tonalityEnabled: false,
  })

  // Load settings from localStorage on component mount
  useEffect(() => {
    const storedSettings = localStorage.getItem(`steering-settings-${fileId}`)
    if (storedSettings) {
      try {
        const parsedSettings = JSON.parse(storedSettings)
        setSettings(parsedSettings)
      } catch (error) {
        console.error("Failed to parse stored steering settings:", error)
      }
    }
  }, [fileId])

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`steering-settings-${fileId}`, JSON.stringify(settings))
    onSettingsChange(settings)
  }, [settings, fileId, onSettingsChange])

  const updateSettings = <K extends keyof SteeringSettings>(key: K, value: SteeringSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleButtonOnClick = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [setIsExpanded])

  return (
    <div className={cn("absolute right-4 top-1/2 z-20 -translate-x-4", className)}>
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded-panel"
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="w-72 rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm -translate-y-1/2"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Steering Options</h3>
              <button
                onClick={() => setIsExpanded(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6">
              <AuthorsSelector
                value={settings.authors}
                onChange={(authors) => updateSettings("authors", authors)}
              />

              <TonalityRadar
                value={settings.tonality}
                onChange={(tonality) => updateSettings("tonality", tonality)}
                enabled={settings.tonalityEnabled}
                onToggle={(enabled) => updateSettings("tonalityEnabled", enabled)}
              />

              <TemperatureSlider
                value={settings.temperature}
                onChange={(temperature) => updateSettings("temperature", temperature)}
              />

              <SuggestionsSlider
                value={settings.numSuggestions}
                onChange={(numSuggestions) => updateSettings("numSuggestions", numSuggestions)}
              />
            </div>
          </motion.div>
        ) : (
          <VaultButton
            key="collapsed-button"
            onClick={handleButtonOnClick}
            size="small"
            color="yellow"
            title="Steering"
          >
            <MixerHorizontalIcon className="h-3 w-3" />
          </VaultButton>
        )}
      </AnimatePresence>
    </div>
  )
}
