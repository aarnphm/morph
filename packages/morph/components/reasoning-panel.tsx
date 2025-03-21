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
  const [isExpanded, setIsExpanded] = useState(false)
  const reasoningRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when content changes and panel is expanded
  useEffect(() => {
    if (isExpanded && reasoningRef.current && isStreaming) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight
    }
  }, [reasoning, isExpanded, isStreaming])

  const toggleExpand = () => setIsExpanded((prev) => !prev)

  return (
    <div className={cn("w-full p-4 bg-card border border-border rounded shadow-sm", className)}>
      <div className="flex items-center justify-between">
        <button
          onClick={toggleExpand}
          className="flex items-center gap-1 text-sm font-medium hover:text-foreground transition-colors text-left"
        >
          <ChevronRightIcon
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              isExpanded && "transform rotate-90",
            )}
          />
          <span className="font-medium">Thinking</span>
        </button>

        <div className="flex items-center">
          {isComplete ? (
            <CheckIcon className="h-4 w-4 text-green-500" />
          ) : (
            isStreaming && (
              <span className="block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1" />
            )
          )}
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="my-2 border-t border-border"></div>
          <div
            ref={reasoningRef}
            className={cn(
              "text-xs text-muted-foreground whitespace-pre-wrap line-clamp-10",
              isExpanded && "overflow-y-auto max-h-[10em]",
            )}
          >
            {reasoning}
          </div>
        </>
      )}
    </div>
  )
}
