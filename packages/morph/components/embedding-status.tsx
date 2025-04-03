import { EyeClosedIcon, EyeOpenIcon } from "@radix-ui/react-icons"
import { useEffect, useState } from "react"

import { cn } from "@/lib"

interface EmbeddingStatusProps {
  status: "in_progress" | "success" | "failure" | "cancelled" | null
  className?: string
}

export function EmbeddingStatus({ status, className }: EmbeddingStatusProps) {
  // For an eye blink effect
  const [eyeIconState, setEyeIconState] = useState<"open" | "closed">("open")

  // Eye blink animation for in-progress embedding
  useEffect(() => {
    if (status !== "in_progress") return

    // Create a blink effect
    const blinkTimer = setInterval(() => {
      setEyeIconState((prev) => (prev === "open" ? "closed" : "open"))
    }, 3000)

    // For a more natural effect, randomly blink occasionally
    const randomBlinkTimer = setInterval(() => {
      if (Math.random() > 0.7) {
        setEyeIconState("closed")
        setTimeout(() => setEyeIconState("open"), 200)
      }
    }, 5000)

    return () => {
      clearInterval(blinkTimer)
      clearInterval(randomBlinkTimer)
    }
  }, [status])

  if (status === "in_progress") {
    return (
      <div className={cn("relative", className)} title="Processing embeddings">
        {eyeIconState === "open" ? (
          <EyeOpenIcon className="w-4 h-4 text-blue-400 animate-pulse" />
        ) : (
          <EyeClosedIcon className="w-4 h-4 text-blue-400/70" />
        )}
      </div>
    )
  }

  if (status === "success") {
    return (
      <div className={cn("relative", className)} title="Embeddings ready">
        <EyeOpenIcon className="w-4 h-4 text-green-400" />
      </div>
    )
  }

  if (status === "failure" || status === "cancelled") {
    return (
      <div className={cn("relative", className)} title="Embedding failed">
        <EyeClosedIcon className="w-4 h-4 text-red-400" />
      </div>
    )
  }

  return null
}
