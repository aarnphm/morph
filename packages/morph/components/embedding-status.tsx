import { cn } from "@/lib"
import { CheckIcon, EyeClosedIcon, EyeOpenIcon } from "@radix-ui/react-icons"
import { useEffect, useState } from "react"

interface EmbeddingStatusProps {
  status: "in_progress" | "success" | "failure" | "cancelled" | null
  className?: string
}

export function EmbeddingStatus({ status, className }: EmbeddingStatusProps) {
  // For an eye blink effect
  const [eyeIconState, setEyeIconState] = useState<"open" | "closed">("open")
  // For fade out animation on success
  const [visible, setVisible] = useState(true)
  // Track when success was achieved
  const [successTimestamp, setSuccessTimestamp] = useState<number | null>(null)

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

  // Handle successful embedding completion with fade-out
  useEffect(() => {
    if (status === "success" && !successTimestamp) {
      // Record when success was first detected
      setSuccessTimestamp(Date.now())

      // Keep visible for 3 seconds, then fade out and hide
      const timeout = setTimeout(() => {
        // Start fade out animation
        setVisible(false)
      }, 3000)

      return () => clearTimeout(timeout)
    }

    // Reset if status changes from success to something else
    if (status !== "success") {
      setSuccessTimestamp(null)
      setVisible(true)
    }
  }, [status, successTimestamp])

  // If status is null or visibility is false, return null
  if (!status || !visible) {
    return null
  }

  if (status === "in_progress") {
    return (
      <div
        className={cn("relative flex items-center gap-1.5", className)}
        title="Processing embeddings"
      >
        {eyeIconState === "open" ? (
          <EyeOpenIcon className="w-4 h-4 text-blue-400 animate-pulse" />
        ) : (
          <EyeClosedIcon className="w-4 h-4 text-blue-400/70" />
        )}
        <span className="text-xs text-blue-400 hidden sm:inline-block">Indexing...</span>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div
        className={cn(
          "relative flex items-center gap-1.5 transition-opacity duration-1000",
          successTimestamp ? "opacity-70" : "opacity-100",
          className,
        )}
        title="Indexing complete"
      >
        <CheckIcon className="w-4 h-4 text-green-400" />
        <span className="text-xs text-green-400 hidden sm:inline-block">Indexing completed</span>
      </div>
    )
  }

  if (status === "failure" || status === "cancelled") {
    return (
      <div className={cn("relative flex items-center gap-1.5", className)} title="Indexing failed">
        <EyeClosedIcon className="w-4 h-4 text-red-400" />
        <span className="text-xs text-red-400 hidden sm:inline-block">Indexing failed</span>
      </div>
    )
  }

  return null
}
