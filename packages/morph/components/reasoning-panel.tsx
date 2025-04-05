import { cn } from "@/lib/utils"
import { ChevronRightIcon, TransformIcon } from "@radix-ui/react-icons"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import * as React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { usePGlite } from "@/context/db"

import * as schema from "@/db/schema"

// Memoized header component to prevent redundant renders
const ReasoningHeader = memo(function ReasoningHeader({
  isExpanded,
  isHovering,
  isStreaming,
  isComplete,
  elapsedTime,
  toggleExpand,
}: {
  isExpanded: boolean
  isHovering: boolean
  isStreaming: boolean
  isComplete: boolean
  elapsedTime: number
  toggleExpand: () => void
}) {
  // Format the duration nicely
  const formattedDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? "s" : ""}`
    } else {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}`
    }
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between text-xs p-1",
        isExpanded && "shadow-lg transition-shadow duration-300",
        isHovering ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <button
        onClick={toggleExpand}
        className="flex items-center gap-1 transition-colors text-left"
      >
        <div
          className={cn(
            "cursor-pointer transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        >
          {isHovering ? (
            <ChevronRightIcon className="h-3 w-3" />
          ) : (
            <TransformIcon className="h-3 w-3" />
          )}
        </div>
        {isComplete ? (
          <span>Finished scheming for {formattedDuration(elapsedTime)}</span>
        ) : (
          <span className={isStreaming ? "animate-text-shimmer" : ""}>Scheming</span>
        )}
      </button>
    </div>
  )
})

interface ReasoningPanelProps {
  reasoning: string
  className?: string
  isStreaming: boolean
  isComplete: boolean
  reasoningId: string
  currentFile?: string
  vaultId?: string
  shouldExpand: boolean
  elapsedTime?: number
  onExpandChange?: (isExpanded: boolean) => void
}

export const ReasoningPanel = memo(function ReasoningPanel({
  reasoning,
  className,
  isStreaming,
  isComplete,
  reasoningId,
  currentFile,
  vaultId,
  shouldExpand = false,
  elapsedTime = 0,
  onExpandChange,
}: ReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(shouldExpand)
  const [isHovering, setIsHovering] = useState(false)
  const reasoningRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number | null>(null)

  const client = usePGlite()
  const db = drizzle({ client, schema })

  // Control expansion state from parent
  useEffect(() => {
    setIsExpanded(shouldExpand)
  }, [shouldExpand])

  // Auto-collapse after completion
  useEffect(() => {
    if (isComplete && !isStreaming && !shouldExpand) {
      // Add a small delay before collapsing
      const timerId = setTimeout(() => {
        setIsExpanded(false)
      }, 2000) // 2 seconds after completion

      return () => clearTimeout(timerId)
    }
  }, [isComplete, isStreaming, shouldExpand])

  // Start timer when streaming begins
  useEffect(() => {
    if (isStreaming && !startTimeRef.current) {
      startTimeRef.current = Date.now()
    }
  }, [isStreaming])

  // Save reasoning to database when complete, not during streaming
  useEffect(() => {
    if (!isStreaming && isComplete && reasoning && currentFile && vaultId) {
      db.update(schema.reasonings)
        .set({ content: reasoning })
        .where(eq(schema.reasonings.id, reasoningId))
        .execute()
    }
  }, [isStreaming, isComplete, reasoning, currentFile, vaultId, reasoningId, db])

  // Auto-scroll to bottom when content changes and panel is expanded
  useEffect(() => {
    if (isExpanded && reasoningRef.current && isStreaming) {
      // Use a more gentle scrolling approach
      const element = reasoningRef.current
      const currentScrollTop = element.scrollTop
      const targetScrollTop = element.scrollHeight - element.clientHeight

      // Only scroll if not already at the bottom
      if (targetScrollTop - currentScrollTop > 5) {
        // Use a simple smooth scroll that won't interfere with other interactions
        element.style.scrollBehavior = "smooth"
        element.scrollTop = targetScrollTop

        // Reset scroll behavior after animation completes
        const resetTimer = setTimeout(() => {
          element.style.scrollBehavior = "auto"
        }, 300)

        return () => clearTimeout(resetTimer)
      }
    }
  }, [reasoning, isExpanded, isStreaming])

  // Notify parent component about expand state changes via callback
  const toggleExpand = useCallback(() => {
    const newExpandState = !isExpanded
    setIsExpanded(newExpandState)
    onExpandChange?.(newExpandState)
  }, [isExpanded, onExpandChange])

  // Format the duration nicely
  const formattedDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? "s" : ""}`
    } else {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}`
    }
  }

  // Virtualized text rendering for performance
  const renderReasoningText = useMemo(() => {
    if (!reasoning) return null

    // For larger text, split into paragraphs for better performance
    if (reasoning.length > 3000) {
      const paragraphs = reasoning
        .split("\n\n")
        .filter(Boolean)
        .map((para, index) => (
          <p key={index} className="mb-2">
            {para}
          </p>
        ))

      return paragraphs
    }

    return <span>{reasoning}</span>
  }, [reasoning])

  return (
    <div
      className={cn("w-full border rounded-md transition-colors duration-200", className)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <ReasoningHeader
        isExpanded={isExpanded}
        isHovering={isHovering}
        isStreaming={isStreaming}
        isComplete={isComplete}
        elapsedTime={elapsedTime}
        toggleExpand={toggleExpand}
      />

      {isExpanded && reasoning && (
        <div
          ref={reasoningRef}
          className={cn(
            "whitespace-pre-wrap ml-2 p-2 border-l-2 border-muted overflow-y-auto scrollbar-hidden max-h-72 transition-all duration-500 ease-in-out",
            "text-xs text-muted-foreground",
            isExpanded ? "opacity-100 h-auto" : "opacity-0 h-0"
          )}
        >
          <span>{renderReasoningText}</span>
        </div>
      )}
    </div>
  )
})
