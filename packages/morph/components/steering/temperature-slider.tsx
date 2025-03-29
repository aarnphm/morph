"use client"

import { useState, useEffect } from "react"
import { DEFAULT_TEMPERATURE } from "@/components/steering/constants"
import { cn } from "@/lib"

interface TemperatureSliderProps {
  value: number
  onChange: (temperature: number) => void
  className?: string
}

export default function TemperatureSlider({ value, onChange, className }: TemperatureSliderProps) {
  const [temperature, setTemperature] = useState(value ?? DEFAULT_TEMPERATURE)

  useEffect(() => {
    onChange(temperature)
  }, [temperature, onChange])

  const getLabel = (temp: number) => {
    if (temp <= 0.3) return "Boring"
    if (temp <= 0.6) return "Balanced"
    if (temp <= 0.8) return "Creative"
    return "Unhinged"
  }

  const getColor = (temp: number) => {
    if (temp <= 0.3) return "text-blue-500"
    if (temp <= 0.6) return "text-green-500"
    if (temp <= 0.8) return "text-yellow-500"
    return "text-red-500"
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Vibes</label>
        <span className={cn("text-xs font-medium", getColor(temperature))}>
          {getLabel(temperature)} ({temperature.toFixed(2)})
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={temperature}
        onChange={(e) => setTemperature(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Boring</span>
        <span>Unhinged</span>
      </div>
    </div>
  )
}
