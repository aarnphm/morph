import * as React from "react"
import { useState, useRef, useEffect, useMemo, memo } from "react"
import { ChevronRightIcon, CheckIcon } from "@radix-ui/react-icons"
import { cn } from "@/lib/utils"
import { db } from "@/db"
import { motion, AnimatePresence } from "motion/react"

// Triple dot loading animation component
const LoadingDots = memo(function LoadingDots() {
  // Define variants for the container to stagger children animations
  const containerVariants = {
    animate: {
      transition: {
        staggerChildren: 0.12,
      },
    },
  }

  // Define variants for individual dots
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

  const memoizedChevronIcon = useMemo(
    () => (
      <motion.div
        initial={{ rotate: isExpanded ? 90 : 0 }}
        animate={{ rotate: isExpanded ? 90 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <ChevronRightIcon className="h-3 w-3" />
      </motion.div>
    ),
    [isExpanded],
  )

  const checkIconRef = useRef<SVGSVGElement>(null)

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "flex items-center justify-between text-xs py-1",
          isExpanded && "shadow-lg transition-shadow duration-300",
        )}
      >
        <button
          onClick={toggleExpand}
          className={cn(
            "flex items-center gap-1 hover:text-foreground transition-colors text-left",
            !isExpanded || (isStreaming && "text-muted-foreground"),
          )}
        >
          {memoizedChevronIcon}
          {isComplete ? (
            <span>Finished scheming for {formattedDuration(elapsedTime)}</span>
          ) : (
            <span className={isStreaming ? "animate-text-shimmer" : ""}>Scheming</span>
          )}
        </button>

        <div className="flex items-center">
          {isComplete ? (
            <CheckIcon className="h-3 w-3 text-green-500" ref={checkIconRef} />
          ) : (
            isStreaming && <LoadingDots />
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && reasoning && (
          <motion.div
            ref={reasoningRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: {
                height: { duration: 0.3, ease: "easeOut" },
                opacity: { duration: 0.2, delay: 0.1 },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                height: { duration: 0.3, ease: "easeIn" },
                opacity: { duration: 0.2 },
              },
            }}
            className="text-xs text-muted-foreground whitespace-pre-wrap ml-2 p-2 border-l-2 border-muted overflow-y-auto scrollbar-hidden max-h-72"
          >
            <span>{reasoning}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
