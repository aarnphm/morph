import { ReasoningHistory } from "@/db"
import rfdc from "rfdc"

import type { Note } from "@/db/interfaces"

export function stripSlashes(s: string, onlyStripPrefix?: boolean): string {
  if (s.startsWith("/")) {
    s = s.substring(1)
  }

  if (!onlyStripPrefix && s.endsWith("/")) {
    s = s.slice(0, -1)
  }

  return s
}

function slugify(s: string): string {
  return s
    .split("/")
    .map((segment) =>
      segment
        .replace(/\s/g, "-")
        .replace(/&/g, "-and-")
        .replace(/%/g, "-percent")
        .replace(/\?/g, "")
        .replace(/#/g, ""),
    )
    .join("/") // always use / as sep
    .replace(/\/$/, "")
}

export function slugifyFilePath(path: string): string {
  return slugify(stripSlashes(path))
}

export const clone = rfdc()

// To be used with search and everything else with flexsearch
export const encode = (str: string) => str.toLowerCase().split(/([^a-z]|[^\x00-\x7F])/)

const contextWindowWords = 30
export const tokenizeTerm = (term: string) => {
  const tokens = term.split(/\s+/).filter((t) => t.trim() !== "")
  const tokenLen = tokens.length
  if (tokenLen > 1) {
    for (let i = 1; i < tokenLen; i++) {
      tokens.push(tokens.slice(0, i + 1).join(" "))
    }
  }

  return tokens.sort((a, b) => b.length - a.length) // always highlight longest terms first
}
export function highlight(searchTerm: string, text: string, trim?: boolean) {
  const tokenizedTerms = tokenizeTerm(searchTerm)
  let tokenizedText = text.split(/\s+/).filter((t) => t !== "")

  let startIndex = 0
  let endIndex = tokenizedText.length - 1
  if (trim) {
    const includesCheck = (tok: string) =>
      tokenizedTerms.some((term) => tok.toLowerCase().startsWith(term.toLowerCase()))
    const occurrencesIndices = tokenizedText.map(includesCheck)

    let bestSum = 0
    let bestIndex = 0
    for (let i = 0; i < Math.max(tokenizedText.length - contextWindowWords, 0); i++) {
      const window = occurrencesIndices.slice(i, i + contextWindowWords)
      const windowSum = window.reduce((total, cur) => total + (cur ? 1 : 0), 0)
      if (windowSum >= bestSum) {
        bestSum = windowSum
        bestIndex = i
      }
    }

    startIndex = Math.max(bestIndex - contextWindowWords, 0)
    endIndex = Math.min(startIndex + 2 * contextWindowWords, tokenizedText.length - 1)
    tokenizedText = tokenizedText.slice(startIndex, endIndex)
  }

  const slice = tokenizedText
    .map((tok) => {
      // see if this tok is prefixed by any search terms
      for (const searchTok of tokenizedTerms) {
        if (tok.toLowerCase().includes(searchTok.toLowerCase())) {
          const regex = new RegExp(searchTok.toLowerCase(), "gi")
          return tok.replace(regex, `<span class="font-bold">$&</span>`)
        }
      }
      return tok
    })
    .join(" ")

  return `${startIndex === 0 ? "" : "..."}${slice}${
    endIndex === tokenizedText.length - 1 ? "" : "..."
  }`
}

// Add a helper function to sanitize streaming content by removing trailing JSON syntax
export const sanitizeStreamingContent = (content: string): string => {
  if (!content) return ""

  // Remove any trailing JSON syntax characters that might be part of streaming
  // This handles cases like trailing quotes, braces, commas, etc.
  let sanitized = content

  // First, check if we have an incomplete escape sequence at the end
  if (sanitized.endsWith("\\")) {
    sanitized = sanitized.slice(0, -1)
  }

  // Remove any trailing JSON syntax characters
  sanitized = sanitized.replace(/[\"\}\,\]\s]+$/, "")

  // Also handle cases where there might be escaped quotes
  sanitized = sanitized.replace(/\\\"$/, "")

  return sanitized
}

export * from "@/lib/utils"
export * from "@/lib/jsx"

// Date formatting utilities
export interface FormattedDateResult {
  formattedDate: string
  formattedTime: string
  relativeTime: string
}

/**
 * Parse a date string in the format "dateString-hour-minute-seconds" and format it for display
 */
export function formatDateString(dateStr: string): FormattedDateResult {
  // Split the dateStr to get the date part, hour part, minute part, and second interval part
  const [datePart, hourPart, minutePart, secondsPart] = dateStr.split("-")
  const date = new Date(datePart)
  const hour = parseInt(hourPart)
  const minute = parseInt(minutePart)
  const seconds = secondsPart ? parseInt(secondsPart) : 0

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  // Format as MM/DD/YYYY
  const formattedDate = `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")}/${date.getFullYear()}`

  // Format hour and minute (12-hour format with AM/PM)
  const formattedTime = `${hour % 12 === 0 ? 12 : hour % 12}:${minute.toString().padStart(2, "0")}${seconds > 0 ? `:${seconds}` : ""}${hour < 12 ? "AM" : "PM"}`

  // Calculate relative time indicator
  let relativeTime = ""
  if (date.toDateString() === today.toDateString()) {
    if (today.getHours() === hour) {
      if (today.getMinutes() === minute) {
        const secondsDiff = today.getSeconds() - seconds
        if (secondsDiff < 60) {
          if (secondsDiff <= 1) {
            // Consider 0 or 1 second as "just now"
            relativeTime = "just now"
          } else {
            relativeTime = `${secondsDiff} seconds ago`
          }
        } else {
          relativeTime = "this minute" // If secondsDiff >= 60 but minute is same
        }
      } else {
        const minuteDiff = today.getMinutes() - minute
        if (minuteDiff === 1 && today.getSeconds() < seconds) {
          // Less than a full minute ago
          relativeTime = "just now"
        } else if (minuteDiff === 1) {
          relativeTime = "1 minute ago"
        } else {
          relativeTime = `${minuteDiff} minutes ago`
        }
      }
    } else if (today.getHours() - hour === 1 && 60 - minute + today.getMinutes() < 60) {
      // Less than an hour ago
      relativeTime = `${60 - minute + today.getMinutes()} minutes ago`
    } else if (today.getHours() - hour === 1) {
      relativeTime = "1 hour ago"
    } else {
      relativeTime = `${today.getHours() - hour} hours ago`
    }
  } else if (date.toDateString() === yesterday.toDateString()) {
    relativeTime = "yesterday"
  } else {
    const diffTime = Math.abs(today.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    relativeTime = `${diffDays} days ago`
  }

  return {
    formattedDate,
    formattedTime,
    relativeTime,
  }
}

export function safeDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null

  try {
    const date = new Date(dateStr)
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null
    }
    return date
  } catch (error) {
    console.error(`Failed to parse date string: ${dateStr}`, error)
    return null
  }
}

// Add a debug logging helper function that only runs in development
export function debugLog(message: string, ...data: any) {
  if (process.env.NODE_ENV !== "development") return
  console.debug(message, ...data)
}

// Add a function to log reasoning and note groups data
export function logReasoningAndGroups(
  reasoningHistory: ReasoningHistory[],
  noteGroups: [string, Note[]][],
) {
  if (process.env.NODE_ENV !== "development") return

  debugLog(
    `[NotesPanel] Reasoning history: ${reasoningHistory.length}, Note groups: ${noteGroups.length}`,
  )

  if (reasoningHistory.length > 0) {
    const allNoteIds = reasoningHistory.map((r) => r.noteIds).flat()
    debugLog(`[NotesPanel] All reasoning noteIds:`, allNoteIds)

    reasoningHistory.forEach((r) => {
      debugLog(`[NotesPanel] Reasoning ${r.id} has ${r.noteIds?.length || 0} noteIds:`, r.noteIds)
    })
  }

  if (noteGroups.length > 0) {
    debugLog(`[NotesPanel] Found ${noteGroups.length} note groups:`)
    noteGroups.forEach(([dateStr, notes]) => {
      debugLog(
        `[NotesPanel] Group '${dateStr}' has ${notes.length} notes:`,
        notes.map((n) => n.id),
      )
    })
  } else {
    debugLog(`[NotesPanel] No note groups found - check filtering in noteGroupsData creation`)
  }
}

// Add an analysis function that helps diagnose noteGroupsData filtering issues
export function analyzeNotesFiltering(allNotes: Note[], droppedNotes: Note[]) {
  if (process.env.NODE_ENV !== "development") return

  // Get counts to understand filtering
  const totalNotes = allNotes.length
  const droppedNotesCount = droppedNotes.length
  const droppedNoteIds = new Set(droppedNotes.map((note) => note.id))

  // Count notes with dropped flag
  const notesWithDroppedFlag = allNotes.filter((note) => note.dropped).length

  // Count notes that are in allNotes but not in droppedNotes
  const nonDroppedNotes = allNotes.filter(
    (note) => !droppedNoteIds.has(note.id) && !note.dropped,
  ).length

  debugLog(`[Notes Analysis] Total notes: ${totalNotes}, Dropped notes: ${droppedNotesCount}`)
  debugLog(`[Notes Analysis] Notes with dropped flag: ${notesWithDroppedFlag}`)
  debugLog(`[Notes Analysis] Non-dropped notes that should appear in groups: ${nonDroppedNotes}`)

  if (nonDroppedNotes === 0) {
    // Detailed analysis of what might be happening
    const droppedFlagButNotInDroppedNotes = allNotes.filter(
      (note) => note.dropped && !droppedNoteIds.has(note.id),
    ).length

    const inDroppedNotesButNoFlag = allNotes.filter(
      (note) => !note.dropped && droppedNoteIds.has(note.id),
    ).length

    debugLog(
      `[Notes Analysis] Notes with dropped flag but not in droppedNotes array: ${droppedFlagButNotInDroppedNotes}`,
    )
    debugLog(
      `[Notes Analysis] Notes in droppedNotes array but without dropped flag: ${inDroppedNotesButNoFlag}`,
    )

    if (droppedFlagButNotInDroppedNotes > 0) {
      debugLog(
        "[Notes Analysis] ISSUE: There are notes marked as dropped but not in the droppedNotes array",
      )
    }

    if (inDroppedNotesButNoFlag > 0) {
      debugLog(
        "[Notes Analysis] ISSUE: There are notes in the droppedNotes array but without the dropped flag",
      )
    }

    if (totalNotes === droppedNotesCount) {
      debugLog(
        "[Notes Analysis] All notes are in the droppedNotes array, which is why noteGroupsData is empty",
      )
    }

    if (totalNotes === notesWithDroppedFlag) {
      debugLog(
        "[Notes Analysis] All notes have the dropped flag set to true, which is why noteGroupsData is empty",
      )
    }
  }
}
