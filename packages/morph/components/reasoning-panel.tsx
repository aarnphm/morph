import * as React from "react"
import { useState, useRef, useEffect, useMemo } from "react"
import { ChevronRightIcon, CheckIcon } from "@radix-ui/react-icons"
import { cn } from "@/lib/utils"
import { db } from "@/db"

interface ReasoningPanelProps {
  reasoning: string
  className?: string
  isStreaming: boolean
  isComplete: boolean
  reasoningId: string
  currentFile?: string
  vaultId?: string
  shouldExpand?: boolean
  onCollapseComplete?: () => void
  elapsedTime: number
}

export function ReasoningPanel({
  reasoning,
  className,
  isStreaming,
  isComplete,
  currentFile,
  vaultId,
  reasoningId,
  shouldExpand = false,
  onCollapseComplete,
  elapsedTime,
}: ReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(shouldExpand)
  const reasoningRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number | null>(null)

  // Control expansion state from parent
  useEffect(() => {
    setIsExpanded(shouldExpand || isStreaming)
  }, [shouldExpand, isStreaming])

  // Auto-collapse after completion
  useEffect(() => {
    if (isComplete && !isStreaming && !shouldExpand) {
      // Add a small delay before collapsing
      const timerId = setTimeout(() => {
        setIsExpanded(false)
        if (onCollapseComplete) {
          onCollapseComplete()
        }
      }, 2000) // 2 seconds after completion

      return () => clearTimeout(timerId)
    }
  }, [isComplete, isStreaming, onCollapseComplete, shouldExpand])

  // Start timer when streaming begins
  useEffect(() => {
    if (isStreaming && !startTimeRef.current) {
      startTimeRef.current = Date.now()
    }
  }, [isStreaming])

  // Save reasoning to database when complete
  useEffect(() => {
    if (isStreaming && reasoning && currentFile && vaultId) {
      db.reasonings.update(reasoningId, { content: reasoning })
    }
  }, [isStreaming, reasoning, currentFile, vaultId, reasoningId])

  // Auto-scroll to bottom when content changes and panel is expanded
  useEffect(() => {
    if (isExpanded && reasoningRef.current && isStreaming) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight
    }
  }, [reasoning, isExpanded, isStreaming])

  const toggleExpand = () => setIsExpanded((prev) => !prev)

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

  const memoizedChevronIcon = useMemo(() => (
    <ChevronRightIcon
      className={cn(
        "h-3 w-3 transition-transform duration-200",
        isExpanded && "transform rotate-90",
      )}
    />
  ), [isExpanded])

  const memoizedCheckIcon = useMemo(() => (
    <CheckIcon className="h-3 w-3 text-green-500" />
  ), [])

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn("flex items-center justify-between text-xs py-1", isExpanded && "shadow-lg")}
      >
        <button
          onClick={toggleExpand}
          className={cn(
            "flex items-center gap-1 hover:text-foreground transition-colors text-left",
            !isExpanded && "text-muted-foreground",
          )}
        >
          {memoizedChevronIcon}
          {isComplete ? (
            <span>Finished scheming for {formattedDuration(elapsedTime)}</span>
          ) : (
            <span className={isStreaming ? "animate-pulse" : ""}>Scheming</span>
          )}
        </button>

        <div className="flex items-center">
          {isComplete ? (
            memoizedCheckIcon
          ) : (
            isStreaming && (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin h-3 w-3 text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </span>
            )
          )}
        </div>
      </div>

      {isExpanded && reasoning && (
        <div
          ref={reasoningRef}
          className="text-xs text-muted-foreground whitespace-pre-wrap ml-2 p-2 border-l-2 border-muted overflow-y-auto scrollbar-hidden max-h-60 transition-all duration-200 animate-in slide-in-from-top-2 duration-300 ease-in-out"
        >
          <span>{reasoning}</span>
        </div>
      )}
    </div>
  )
}
