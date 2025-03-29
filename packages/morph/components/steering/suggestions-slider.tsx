"use client"

import { useState, useEffect } from "react"
import { DEFAULT_NUM_SUGGESTIONS } from "@/components/steering/constants"
import { cn } from "@/lib"

interface SuggestionsSliderProps {
  value: number
  onChange: (numSuggestions: number) => void
  className?: string
}

export default function SuggestionsSlider({ value, onChange, className }: SuggestionsSliderProps) {
  const [numSuggestions, setNumSuggestions] = useState(value ?? DEFAULT_NUM_SUGGESTIONS)

  useEffect(() => {
    onChange(numSuggestions)
  }, [numSuggestions, onChange])

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Number of Sticky Notes</label>
        <span className="text-xs text-muted-foreground">{numSuggestions}</span>
      </div>
      <input
        type="range"
        min="1"
        max="8"
        step="1"
        value={numSuggestions}
        onChange={(e) => setNumSuggestions(parseInt(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>1</span>
        <span>8</span>
      </div>
    </div>
  )
}

