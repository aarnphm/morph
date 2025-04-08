"use client"

import { cn } from "@/lib"
import { ContextNote, useContextAwareNotes } from "@/services/context-aware-notes"
import { EditorView } from "@codemirror/view"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebouncedCallback } from "use-debounce"

import { NoteCard } from "@/components/note-card"

import { useNotesContext } from "@/context/notes"


interface ContextNotesProps extends React.HTMLAttributes<HTMLDivElement> {
  editorViewRef: React.RefObject<EditorView | null>
  readingModeRef: React.RefObject<HTMLDivElement | null>
  isEditMode: boolean
  onVisibleNotesChange?: (visibleNoteIds: string[]) => void
}

export default memo(function ContextNotes({
  className,
  editorViewRef,
  readingModeRef,
  isEditMode,
  onVisibleNotesChange,
  ...props
}: ContextNotesProps) {
  // Get state from NotesContext instead of props
  const { state: { droppedNotes, currentFileId, currentVaultId } } = useNotesContext();

  const [visibleContextNotes, setVisibleContextNotes] = useState<ContextNote[]>([])
  const [visibleLines, setVisibleLines] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  })
  const containerRef = useRef<HTMLDivElement>(null)

  // Use useMemo for noteIds to prevent unnecessary recalculations
  const noteIds = useMemo(() => droppedNotes.map((note) => note.id), [droppedNotes])

  // Track if we've already loaded notes for this combination
  const loadedRef = useRef<boolean>(false)
  const previousFileIdRef = useRef<string | null>(currentFileId)
  const previousNoteIdsRef = useRef<string[]>(noteIds)

  // Use our context notes hook with currentFileId and currentVaultId from context
  const { getSimilarNotes } = useContextAwareNotes(
    currentFileId || "",
    currentVaultId || "",
    noteIds
  )

  // Context notes data - cached until fileId, vaultId, or noteIds change
  const [contextNotes, setContextNotes] = useState<ContextNote[]>([])

  // Add a debug mode toggle at the top of the component
  const [debugMode, setDebugMode] = useState(false)

  // Add debug toggle handler
  const toggleDebugMode = useCallback(() => {
    setDebugMode((prev) => !prev)
    console.log(`[ContextNotes] Debug mode ${!debugMode ? "enabled" : "disabled"}`)
  }, [debugMode])

  // Check if noteIds have changed
  const haveNoteIdsChanged = useCallback(() => {
    if (previousNoteIdsRef.current.length !== noteIds.length) return true
    return !previousNoteIdsRef.current.every((id) => noteIds.includes(id))
  }, [noteIds])

  // Function to determine visible line range based on scroll position
  const updateVisibleLines = useDebouncedCallback(() => {
    if (!editorViewRef.current && !readingModeRef.current) return

    try {
      let startLine = 0
      let endLine = 0

      if (isEditMode && editorViewRef.current) {
        // For edit mode (CodeMirror), get visible lines from editor view
        const editor = editorViewRef.current
        const scrollInfo = editor.scrollDOM
        const viewportHeight = scrollInfo.clientHeight
        const scrollTop = scrollInfo.scrollTop

        // Get visible range
        const fromPos = editor.lineBlockAtHeight(scrollTop)
        const toPos = editor.lineBlockAtHeight(scrollTop + viewportHeight)

        startLine = fromPos.from
        endLine = toPos.to

        // Convert from character positions to line numbers
        const doc = editor.state.doc
        startLine = doc.lineAt(startLine).number - 1 // 0-indexed
        endLine = doc.lineAt(endLine).number - 1 // 0-indexed
      } else if (!isEditMode && readingModeRef.current) {
        // For reading mode, estimate visible lines based on scroll position
        const container = readingModeRef.current
        const scrollTop = container.scrollTop
        const viewportHeight = container.clientHeight

        // Rough estimate of lines visible (assuming average line height of 24px)
        const lineHeight = 24
        startLine = Math.floor(scrollTop / lineHeight)
        endLine = Math.floor((scrollTop + viewportHeight) / lineHeight)
      }

      // Update visible range
      setVisibleLines({ start: startLine, end: endLine })

      // Filter context notes to only show those relevant to visible lines
      if (contextNotes.length > 0) {
        // Create a larger buffer for smoother transitions
        const bufferSize = 15 // Lines above and below visible area

        const visibleNotes = contextNotes.filter((note) => {
          const noteLine = note.lineNumber || 0
          // Add buffer around visible area
          return noteLine >= startLine - bufferSize && noteLine <= endLine + bufferSize
        })
        setVisibleContextNotes(visibleNotes)

        // Notify parent of visible note IDs
        if (onVisibleNotesChange) {
          const visibleNoteIds = visibleNotes.map((note) => note.note.id)
          onVisibleNotesChange(visibleNoteIds)
        }
      }
    } catch (error) {
      console.error("[ContextNotes] Error updating visible lines:", error)
    }
  })

  // Load context notes data when dependencies change
  useEffect(() => {
    // Only reload if the file ID changed or notes changed
    const fileChanged = previousFileIdRef.current !== currentFileId
    const notesChanged = haveNoteIdsChanged()

    // Skip loading if we don't have needed data
    if (!currentFileId || !currentVaultId || noteIds.length === 0) {
      loadedRef.current = false
      return
    }

    // Reduce unnecessary loads - only load on initial mount or when data changes
    if (!loadedRef.current || fileChanged || notesChanged) {
      loadedRef.current = true
      previousFileIdRef.current = currentFileId
      previousNoteIdsRef.current = [...noteIds]

      const loadContextNotes = async () => {
        try {
          const similarNotes = await getSimilarNotes()
          setContextNotes(similarNotes)

          // Update visible notes after loading
          updateVisibleLines.flush()
        } catch (error) {
          console.error("[ContextNotes] Error loading similar notes:", error)
        }
      }

      loadContextNotes()
    }
  }, [currentFileId, currentVaultId, noteIds, getSimilarNotes, updateVisibleLines, haveNoteIdsChanged])

  // Set up scroll listeners
  useEffect(() => {
    // Initial update once when mounting or when mode changes
    updateVisibleLines.flush()

    // Get the correct scroll container based on mode
    const scrollContainer = isEditMode ? editorViewRef.current?.scrollDOM : readingModeRef.current

    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", updateVisibleLines)

      return () => {
        scrollContainer.removeEventListener("scroll", updateVisibleLines)
      }
    }
  }, [isEditMode, updateVisibleLines, editorViewRef, readingModeRef]) // Include updateVisibleLines in dependencies

  // Also update when context notes change
  useEffect(() => {
    if (contextNotes.length > 0) {
      updateVisibleLines.flush()
    }
  }, [contextNotes, updateVisibleLines])

  // Effect to call onVisibleNotesChange when visibleContextNotes changes
  useEffect(() => {
    if (onVisibleNotesChange) {
      const visibleNoteIds = visibleContextNotes.map((note) => note.note.id)
      onVisibleNotesChange(visibleNoteIds)
    }
  }, [visibleContextNotes, onVisibleNotesChange])

  // No visible notes or no dropped notes, no render
  if (visibleContextNotes.length === 0 || droppedNotes.length === 0) {
    // Don't call onVisibleNotesChange here - that's done in the effect above
    return null
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative z-40 h-full pointer-events-none w-52 md:w-56 lg:w-60 xl:w-64 xl:top-2 xl:left-20 xl:translate-x-1/2 left-2 md:left-4",
        className,
      )}
      {...props}
    >
      <AnimatePresence mode="sync">
        {visibleContextNotes.map((contextNote) => {
          // Calculate position - assume 24px line height
          const lineHeight = 24
          const targetLine = contextNote.lineNumber || 0
          const scrollContainer = isEditMode
            ? editorViewRef.current?.scrollDOM
            : readingModeRef.current

          // Skip if no scroll container
          if (!scrollContainer) return null

          // Calculate position relative to visible area
          const topOffset =
            (targetLine - visibleLines.start) * lineHeight +
            (isEditMode && editorViewRef.current
              ? editorViewRef.current.scrollDOM.scrollTop % lineHeight
              : readingModeRef.current
                ? readingModeRef.current.scrollTop % lineHeight
                : 0)

          return (
            <motion.div
              key={contextNote.note.id}
              className="relative pointer-events-auto transform xl:right-4 xl:top-0"
              initial={{ opacity: 0, x: -100 }}
              animate={{
                opacity: 1,
                x: 0,
                top: `${topOffset}px`,
              }}
              exit={{ opacity: 0, x: -100 }}
              transition={{
                duration: 0.3,
                ease: "easeOut",
              }}
              style={{}}
            >
              <NoteCard note={contextNote.note} className="max-w-full overflow-visible" size="sm" />
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Debug button for development */}
      {process.env.NODE_ENV !== "production" && (
        <div className="fixed bottom-2 left-2 z-50 pointer-events-auto">
          <button
            onClick={toggleDebugMode}
            className="bg-gray-800/80 hover:bg-gray-700/80 text-white px-2 py-1 rounded text-xs"
          >
            {debugMode ? "Hide Debug" : "Debug Mode"}
          </button>

          {debugMode && contextNotes.length > 0 && (
            <div className="mt-2 bg-black/80 text-white p-2 rounded text-xs max-w-xs max-h-40 overflow-y-auto">
              <div className="font-bold">Debug Info:</div>
              <div className="bg-green-500/80 text-white px-2 py-1 rounded text-xs z-50 my-4">
                {contextNotes.length} context matches found
              </div>
              <div>File ID: {currentFileId || "none"}</div>
              <div>
                Notes: {noteIds.length} (with {contextNotes.length} matches)
              </div>
              <div>Visible: {visibleContextNotes.length} notes</div>
              <div>
                Visible lines: {visibleLines.start}-{visibleLines.end}
              </div>
              <div className="mt-1 font-bold">Matches:</div>
              {contextNotes.slice(0, 3).map((note, i) => (
                <div key={i} className="mt-1">
                  Note {i + 1}: line {note.lineNumber} ({Math.round(note.similarity * 100)}%)
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
