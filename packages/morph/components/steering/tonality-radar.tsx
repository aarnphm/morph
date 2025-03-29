"use client"

import { useState, useEffect } from "react"
import { DEFAULT_TONALITY } from "@/components/steering/constants"
import { cn } from "@/lib"

interface TonalityRadarProps {
  value: Record<string, number>
  onChange: (tonality: Record<string, number>) => void
  enabled: boolean
  onToggle: (enabled: boolean) => void
  className?: string
}

export default function TonalityRadar({
  value,
  onChange,
  enabled,
  onToggle,
  className,
}: TonalityRadarProps) {
  const [tonality, setTonality] = useState<Record<string, number>>(value || DEFAULT_TONALITY)

  useEffect(() => {
    if (enabled) {
      onChange(tonality)
    } else {
      onChange(DEFAULT_TONALITY)
    }
  }, [tonality, onChange, enabled])

  const handleTonalityChange = (key: string, value: number) => {
    // Ensure values sum to 1 (100%)
    const newTonality = { ...tonality, [key]: value }

    // Calculate sum excluding the changed dimension
    const restSum = Object.entries(newTonality)
      .filter(([k]) => k !== key)
      .reduce((sum, [, v]) => sum + v, 0)

    // If sum exceeds 1, normalize other values
    if (restSum + value > 1) {
      // Calculate the scaling factor for other dimensions
      const scale = restSum > 0 ? (1 - value) / restSum : 0

      // Scale other dimensions
      Object.keys(newTonality).forEach((k) => {
        if (k !== key) {
          newTonality[k] = scale * newTonality[k]
        }
      })
    }

    setTonality(newTonality)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Tonality</label>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="tonality-toggle"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="tonality-toggle" className="ml-2 text-xs text-muted-foreground">
            Enable
          </label>
        </div>
      </div>

      {enabled && (
        <div className="space-y-3">
          {Object.keys(tonality).map((key) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs capitalize">{key}</label>
                <span className="text-xs text-muted-foreground">
                  {Math.round(tonality[key] * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={tonality[key]}
                onChange={(e) => handleTonalityChange(key, parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

