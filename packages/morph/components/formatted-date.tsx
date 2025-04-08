import { cn } from "@/lib"
import { formatDateString } from "@/lib"
import * as React from "react"

interface FormattedDateProps {
  dateString: string
  className?: string
  showRelativeTime?: boolean
}

/**
 * A component that displays a formatted date with optional relative time
 */
export function FormattedDate({
  dateString,
  className,
  showRelativeTime = true,
}: FormattedDateProps) {
  const { formattedDate, formattedTime, relativeTime } = formatDateString(dateString)

  return (
    <div className={cn("flex justify-between items-center w-full", className)}>
      <span>
        {formattedDate} {formattedTime}
      </span>
      {showRelativeTime && (
        <span className="text-xs text-muted-foreground italic">{relativeTime}</span>
      )}
    </div>
  )
}
