import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { ChevronRightIcon, CheckIcon } from "@radix-ui/react-icons"
import { cn } from "@/lib/utils"

interface ReasoningPanelProps {
  reasoning: string
  className?: string
  isStreaming: boolean
  isComplete: boolean
}

export function ReasoningPanel({
  reasoning,
  className,
  isStreaming,
  isComplete,
}: ReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const reasoningRef = useRef<HTMLDivElement>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const startTimeRef = useRef<number | null>(null)

  // Start timer when streaming begins
  useEffect(() => {
    if (isStreaming && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
  }, [isStreaming]);

  // Calculate elapsed time when complete
  useEffect(() => {
    if (isComplete && startTimeRef.current) {
      const endTime = Date.now();
      const duration = Math.round((endTime - startTimeRef.current) / 1000);
      setElapsedTime(duration);
    }
  }, [isComplete]);

  // Auto-scroll to bottom when content changes and panel is expanded
  useEffect(() => {
    if (isExpanded && reasoningRef.current && isStreaming) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight
    }
  }, [reasoning, isExpanded, isStreaming])

  const toggleExpand = () => setIsExpanded((prev) => !prev)

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("flex items-center justify-between text-xs py-1", isExpanded && "border-b")}>
        <button
          onClick={toggleExpand}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-left"
        >
          <ChevronRightIcon
            className={cn(
              "h-3 w-3 transition-transform duration-200",
              isExpanded && "transform rotate-90",
            )}
          />
          {isComplete ? (
            <span>Thought for {elapsedTime} seconds</span>
          ) : (
            <span>Thinking...</span>
          )}
        </button>

        <div className="flex items-center">
          {isComplete ? (
            <CheckIcon className="h-3 w-3 text-green-500" />
          ) : (
            isStreaming && (
              <span className="flex items-center">
                <span className="block w-1 h-1 rounded-full bg-blue-500 animate-pulse mr-1"></span>
                <span className="block w-1 h-1 rounded-full bg-blue-500 animate-pulse delay-150 mr-1"></span>
                <span className="block w-1 h-1 rounded-full bg-blue-500 animate-pulse delay-300"></span>
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
          <span className={isStreaming ? "animate-pulse" : ""}>
            {reasoning}
          </span>
        </div>
      )}
    </div>
  )
}
