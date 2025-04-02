import { cn } from "@/lib/utils"
import { ChevronRightIcon, TransformIcon } from "@radix-ui/react-icons"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { usePGlite } from "@/context/db"

import * as schema from "@/db/schema"

// Triple dot loading animation component
const LoadingDots = memo(function LoadingDots() {
  const containerVariants = {
    animate: {
      transition: {
        staggerChildren: 0.12,
      },
    },
  }
  const dotVariants = {
    initial: {
      scaleY: 1,
      opacity: 0.5,
    },
    animate: {
      scaleY: [1, 2.2, 1],
      opacity: [0.5, 1, 0.5],
      transition: {
        duration: 0.7,
        repeat: Infinity,
        repeatType: "loop" as const,
        ease: "easeInOut",
      },
    },
  }

  return (
    <motion.div
      className="flex items-center space-x-1.5 ml-1"
      variants={containerVariants}
      initial="initial"
      animate="animate"
    >
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="w-[2px] h-[3px] bg-current text-primary/70 inline-block"
          style={{ transformOrigin: "center" }}
          variants={dotVariants}
        />
      ))}
    </motion.div>
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

  // Save reasoning to database when complete - batch updates to reduce database writes
  useEffect(() => {
    if (isStreaming && reasoning && currentFile && vaultId) {
      // Debounce database updates to reduce writes
      const debouncedUpdate = setTimeout(() => {
        db.update(schema.reasonings)
          .set({ content: reasoning })
          .where(eq(schema.reasonings.id, reasoningId))
          .execute()
      }, 500)

      return () => clearTimeout(debouncedUpdate)
    }
  }, [isStreaming, reasoning, currentFile, vaultId, reasoningId, db])

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
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="cursor-pointer"
          >
            {isHovering ? (
              <ChevronRightIcon className="h-3 w-3" />
            ) : (
              <TransformIcon className="h-3 w-3" />
            )}
          </motion.div>
          {isComplete ? (
            <span>Finished scheming for {formattedDuration(elapsedTime)}</span>
          ) : (
            <span className={isStreaming ? "animate-text-shimmer" : ""}>Scheming</span>
          )}
        </button>

        <div className="flex items-center">{isStreaming && <LoadingDots />}</div>
      </div>

      <AnimatePresence>
        {isExpanded && reasoning && (
          <motion.div
            ref={reasoningRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className={cn(
              "whitespace-pre-wrap ml-2 p-2 border-l-2 border-muted overflow-y-auto scrollbar-hidden max-h-72 transition-colors duration-200 will-change-transform",
              "text-xs text-muted-foreground",
            )}
          >
            {renderReasoningText}
            {isStreaming && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
              >
                █
              </motion.span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
