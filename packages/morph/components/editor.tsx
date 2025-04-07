"use client"

import { cn, toJsx } from "@/lib"
import { generatePastelColor } from "@/lib/notes"
import { groupNotesByDate } from "@/lib/notes"
import { checkFileHasEmbeddings, useProcessPendingEssayEmbeddings } from "@/services/essays"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { Compartment, EditorState } from "@codemirror/state"
import { keymap } from "@codemirror/view"
import { EditorView } from "@codemirror/view"
import { createId } from "@paralleldrive/cuid2"
import { CopyIcon, Cross2Icon } from "@radix-ui/react-icons"
import { Vim, vim } from "@replit/codemirror-vim"
import { hyperLink } from "@uiw/codemirror-extensions-hyper-link"
import CodeMirror from "@uiw/react-codemirror"
import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import type { Root } from "hast"
import { AnimatePresence, motion } from "motion/react"
import { useTheme } from "next-themes"
import * as React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import { toast } from "sonner"
import { useDebouncedCallback } from "use-debounce"

import { AuthorProcessor } from "@/components/author-processor"
import ContextNotes from "@/components/context-notes"
import { CustomDragLayer, EditorDropTarget } from "@/components/dnd"
import { EssayEmbeddingProcessor } from "@/components/essay-embedding-processor"
import { fileField, mdToHtml, setFile } from "@/components/markdown-inline"
import { NoteEmbeddingProcessor } from "@/components/note-embedding-processor"
import { DroppedNoteGroup } from "@/components/note-group"
import { NotesPanel } from "@/components/note-panel"
import { theme as editorTheme, frontmatter, md, syntaxHighlighting } from "@/components/parser"
import { search } from "@/components/parser/codemirror"
import Rails from "@/components/rails"
import { SearchCommand } from "@/components/search-command"
import { SettingsPanel } from "@/components/settings-panel"
import { VaultButton } from "@/components/ui/button"
import { DotIcon } from "@/components/ui/icons"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

import { usePGlite } from "@/context/db"
import { useEssayEmbeddingTasks } from "@/context/embedding"
import { useRestoredFile } from "@/context/file-restoration"
import { SearchProvider } from "@/context/search"
import { SteeringProvider } from "@/context/steering"
import { useVaultContext } from "@/context/vault"
import { verifyHandle } from "@/context/vault-reducer"

import useFsHandles from "@/hooks/use-fs-handles"
import usePersistedSettings from "@/hooks/use-persisted-settings"

import type { FileSystemTreeNode, Note, Vault } from "@/db/interfaces"
import * as schema from "@/db/schema"

// Add this utility function after the imports but before the Editor component
/**
 * Utility to query and log all notes for a specific file
 */
async function logNotesForFile(
  db: any,
  fileId: string,
  vaultId: string,
  label: string = "Notes query",
) {
  if (process.env.NODE_ENV !== "development") return

  try {
    console.log(`[Notes Debug] ${label} - Querying all notes for file ${fileId}`)

    // Query all notes for this file
    const fileNotes = await db
      .select()
      .from(schema.notes)
      .where(and(eq(schema.notes.fileId, fileId), eq(schema.notes.vaultId, vaultId)))

    const regularNotes = fileNotes.filter((note: any) => !note.dropped)
    const droppedNotes = fileNotes.filter((note: any) => note.dropped)

    console.log(`[Notes Debug] ${label} - Found ${fileNotes.length} total notes:`)
    console.log(
      `[Notes Debug] ${label} - Regular notes: ${regularNotes.length}, Dropped notes: ${droppedNotes.length}`,
    )

    // Query all reasonings associated with these notes
    const reasoningIds = [
      ...new Set(fileNotes.map((note: any) => note.reasoningId).filter(Boolean)),
    ] as string[] // Explicitly type as string[]

    if (reasoningIds.length > 0) {
      console.log(`[Notes Debug] ${label} - Found ${reasoningIds.length} unique reasoning IDs`)

      const reasonings = await db
        .select()
        .from(schema.reasonings)
        .where(inArray(schema.reasonings.id, reasoningIds))

      console.log(
        `[Notes Debug] ${label} - Retrieved ${reasonings?.length || 0} reasonings from DB`,
      )

      // Log a summary of each reasoning and its notes
      for (const reasoning of reasonings) {
        const notesForReasoning = fileNotes.filter((n: any) => n.reasoningId === reasoning.id)
        console.log(
          `[Notes Debug] ${label} - Reasoning ${reasoning.id} has ${notesForReasoning.length} notes:`,
          notesForReasoning.map((n: any) => ({
            id: n.id,
            dropped: n.dropped,
            embeddingStatus: n.embeddingStatus,
          })),
        )
      }
    } else {
      console.log(`[Notes Debug] ${label} - No reasoning IDs found`)
    }

    return { fileNotes, regularNotes, droppedNotes }
  } catch (error) {
    console.error(`[Notes Debug] ${label} - Error querying notes:`, error)
    return { fileNotes: [], regularNotes: [], droppedNotes: [] }
  }
}

interface EditorProps {
  vaultId: string
  vaults: Vault[]
}

export interface AuthorRequest {
  essay: string
  authors?: string[]
  num_authors?: number
  temperature?: number
  max_tokens?: number
  search_backend?: "exa"
  num_search_results?: number
}

function saveLastFileInfo(vaultId: string | null, fileId: string, handleId: string) {
  if (!vaultId || fileId === null) return
  try {
    localStorage.setItem(
      `morph:last-file:${vaultId}`,
      JSON.stringify({
        lastAccessed: new Date().toISOString(),
        handleId,
        fileId,
      }),
    )
  } catch (storageError) {
    console.error("Failed to save file info to localStorage:", storageError)
  }
}

export default memo(function Editor({ vaultId, vaults }: EditorProps) {
  const { theme } = useTheme()
  const { storeHandle } = useFsHandles()
  const { restoredFile, setRestoredFile } = useRestoredFile()
  const { settings } = usePersistedSettings()

  const { refreshVault, flattenedFileIds } = useVaultContext()
  const [isEditMode, setIsEditMode] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [previewNode, setPreviewNode] = useState<Root | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [currentFileHandle, setCurrentFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [showEphemeralBanner, setShowEphemeralBanner] = useState(false)
  const codeMirrorViewRef = useRef<EditorView | null>(null)
  const readingModeRef = useRef<HTMLDivElement>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [droppedNotes, setDroppedNotes] = useState<Note[]>([])
  const notesContainerRef = useRef<HTMLDivElement>(null)
  const [isStackExpanded, setIsStackExpanded] = useState(false)
  const [vimMode, setVimMode] = useState(settings.vimMode ?? false)
  // Add a ref to track if we've already attempted to restore a file
  const fileRestorationAttempted = useRef(false)
  // Add a state for currentFileId that allows null values
  const [currentFileId, setCurrentFileId] = useState<string | null>(null)
  // Add a state for visible context note IDs (around line 150, with other state declarations)
  const [visibleContextNoteIds, setVisibleContextNoteIds] = useState<string[]>([])
  // Add state for author understanding indicator
  const [isAuthorProcessing, setIsAuthorProcessing] = useState(false)

  const client = usePGlite()
  const db = drizzle({ client, schema })

  const vault: Vault = vaults.find((v) => v.id === vaultId)

  // Add the process pending embeddings mutation for essays
  const processEssayEmbeddings = useProcessPendingEssayEmbeddings(db)

  // create a ref for contents to batch updates
  const contentRef = useRef({ content: "" })

  // Create a ref for the keyboard handler to ensure stable identity
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})

  // Add a ref to track if we've processed essay embeddings for the current file
  const essayEmbeddingProcessedRef = useRef<string | null>(null)

  // Use a ref to store the timeout ID so we can access it in the cleanup function
  const embeddingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get the task actions for adding tasks
  const { addTask: addEssayTask } = useEssayEmbeddingTasks()

  useEffect(() => {
    if (restoredFile && restoredFile!.fileId) setCurrentFileId(restoredFile!.fileId)
  }, [restoredFile])

  // Define updateContentRef function that updates content without logging
  const updateContentRef = useCallback(() => {
    contentRef.current = { content: markdownContent }
  }, [markdownContent])

  const toggleStackExpand = useCallback(() => {
    setIsStackExpanded((prev) => !prev)
  }, [])

  const updatePreview = useCallback(
    async (content: string) => {
      try {
        const tree = await mdToHtml({
          value: content,
          settings,
          vaultId,
          fileid: currentFileId,
          returnHast: true,
        })
        setPreviewNode(tree)
      } catch (error) {
        console.error(error)
      }
    },
    [currentFileId, settings, vaultId],
  )

  // Debounce the preview update function
  const debouncedUpdatePreview = useDebouncedCallback(updatePreview, 300) // 300ms debounce delay

  // Helper function to load file content and UI state
  const loadFileContent = useCallback(
    async (fileId: string, fileHandle: FileSystemFileHandle, content: string) => {
      if (!codeMirrorViewRef.current) return false

      try {
        codeMirrorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: codeMirrorViewRef.current.state.doc.length,
            insert: content,
          },
          effects: setFile.of(fileId),
        })

        // Update state
        setCurrentFileHandle(fileHandle)
        setCurrentFileId(fileId)
        setMarkdownContent(content)
        setHasUnsavedChanges(false)
        setIsEditMode(true)

        // Update preview
        debouncedUpdatePreview(content)

        // If this is not a new file, look up its ID in the database
        if (vault) {
          try {
            const dbFile = await db.query.files.findFirst({
              where: (files, { and, eq }) => and(eq(files.id, fileId), eq(files.vaultId, vaultId)),
            })

            if (dbFile) {
              // Only set current file id if we didn't already have it (important to avoid state conflicts)
              if (dbFile.id !== fileId) {
                setCurrentFileId(dbFile.id)
              }
            } else {
              // If file doesn't exist in the database yet, create it
              const extension = fileHandle.name.includes(".")
                ? fileHandle.name.split(".").pop() || ""
                : ""

              try {
                const newFile = await db
                  .insert(schema.files)
                  .values({
                    id: fileId,
                    name: fileHandle.name,
                    extension,
                    vaultId: vaultId,
                    lastModified: new Date(),
                    embeddingStatus: "in_progress",
                  })
                  .returning()

                if (newFile && newFile.length > 0) {
                  setCurrentFileId(newFile[0].id)
                }
              } catch (dbError) {
                console.error("Error creating file in database:", dbError)
                // Fall back to using provided id
                setCurrentFileId(fileId)
              }
            }
          } catch (error) {
            console.error("Error finding file in database:", error)
            // Fall back to using provided id
            setCurrentFileId(fileId)
          }
        } else {
          setCurrentFileId(fileId)
        }

        return true
      } catch (error) {
        console.error("Error loading file content:", error)
        return false
      }
    },
    [debouncedUpdatePreview, vaultId, vault, db],
  )

  const toggleNotes = useCallback(() => {
    // Simple toggle function that just changes visibility
    setShowNotes(!showNotes)
  }, [showNotes])

  const handleNoteDropped = useCallback(
    async (note: Note) => {
      if (currentFileId === null) return
      console.log(`[Notes Debug] Handling note drop for note ${note.id}`)

      // Ensure note has a color if it doesn't already
      const droppedNote: Note = {
        ...note,
        dropped: true,
        accessedAt: new Date(),
      }

      // Update droppedNotes optimistically without triggering unnecessary motion
      setDroppedNotes((prev) => {
        if (prev.find((n) => n.id === droppedNote.id)) return prev
        // Add note to the end of the array for proper scroll-to behavior
        return [...prev, droppedNote]
      })

      // Find the file in the database to get its ID
      try {
        // First, find the file in the database
        const dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) =>
            and(eq(files.id, currentFileId!), eq(files.vaultId, vault?.id || "")),
        })

        if (!dbFile) {
          console.error("Failed to find file in database when dropping note")
          return
        }

        console.log(`[Notes Debug] Updating note ${note.id} in DB to mark as dropped`)

        // Save to database - update the note's dropped flag
        await db
          .update(schema.notes)
          .set({
            dropped: true,
            color: droppedNote.color,
            accessedAt: droppedNote.accessedAt!, // Update accessedAt timestamp
            fileId: dbFile.id,
            ...(droppedNote.embeddingStatus !== "success" && { embeddingStatus: "in_progress" }),
          })
          .where(eq(schema.notes.id, droppedNote.id))

        console.log(`[Notes Debug] Successfully updated note ${note.id} as dropped in DB`)
      } catch (error) {
        console.error("Failed to update note dropped status:", error)
        // Update dropped notes to show failure
        setDroppedNotes((prev) =>
          prev.map((n) => (n.id === droppedNote.id ? { ...n, embeddingStatus: "failure" } : n)),
        )
      }
    },
    [db, currentFileId, vault],
  )

  const handleSave = useCallback(async () => {
    try {
      let targetHandle = currentFileHandle
      let fileId = currentFileId
      const handleId = createId() // Always generate a new handle ID
      let isNewFile = false

      // If we're working with the default file or don't have a handle, we need to save as a new file
      if (!targetHandle || fileId === null) {
        isNewFile = true
        // For new files, create a new unique file ID if we're using null
        if (fileId === null) {
          fileId = createId()
        }

        // Show the save file picker
        targetHandle = await window.showSaveFilePicker({
          id: vaultId,
          suggestedName: `morph-${fileId}.md`,
          types: [
            {
              description: "Markdown Files",
              accept: { "text/markdown": [".md"] },
            },
          ],
        })
      }

      // Write the file content
      const writable = await targetHandle.createWritable()
      await writable.write(markdownContent)
      await writable.close()

      const file = await targetHandle.getFile()

      // If this is a new file and we have a vault, create a db entry
      if (isNewFile && vault) {
        // Extract the filename and extension
        const filename = targetHandle.name
        const extension = filename.includes(".") ? filename.split(".").pop() || "" : ""

        try {
          // Create a new file entry in the database
          const newFile = await db
            .insert(schema.files)
            .values({
              id: fileId,
              name: filename,
              extension,
              vaultId: vaultId,
              lastModified: new Date(),
              embeddingStatus: "in_progress",
            })
            .returning()

          if (newFile && newFile.length > 0) {
            // Use the database-generated ID if available
            const dbFileId = newFile[0].id

            // Store the handle in IndexedDB with the new ID
            await storeHandle(handleId, vaultId, dbFileId, targetHandle)

            // Update component state with the new file information
            setCurrentFileId(dbFileId)
            setCurrentFileHandle(targetHandle)

            // Refresh the vault to show the new file
            await refreshVault(vaultId)

            // Update fileId to use the DB one for localStorage
            fileId = dbFileId
          }
        } catch (dbError) {
          console.error("Error creating file in database:", dbError)
          // If database save fails, still update local state
          setCurrentFileId(fileId)
          setCurrentFileHandle(targetHandle)

          // Store the handle even if DB fails
          await storeHandle(handleId, vaultId, fileId, targetHandle)
        }
      } else if (currentFileId !== null) {
        // Update last modified time for existing files
        try {
          await db
            .update(schema.files)
            .set({ lastModified: new Date() })
            .where(
              and(eq(schema.files.id, currentFileId), eq(schema.files.vaultId, vault?.id || "")),
            )
        } catch (error) {
          console.error("Error updating file last modified time:", error)
        }
      }

      // Save the current file info to localStorage
      saveLastFileInfo(vaultId, fileId, handleId)

      // Update the restored file context
      setRestoredFile({
        file,
        fileHandle: targetHandle,
        fileId,
        content: markdownContent,
        handleId,
      })

      // Update the content reference only after successful save
      updateContentRef()

      // Reset unsaved changes flag
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error("Error saving file:", error)
    }
  }, [
    setRestoredFile,
    currentFileHandle,
    markdownContent,
    vault,
    refreshVault,
    vaultId,
    storeHandle,
    currentFileId,
    db,
    updateContentRef,
  ])

  const baseExtensions = useMemo(() => {
    const tabSize = new Compartment()

    return [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      frontmatter(),
      EditorView.lineWrapping,
      tabSize.of(EditorState.tabSize.of(settings.tabSize)),
      fileField.init(() => currentFileId),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          // We only update the filename if it explicitly changes via the effect
          const newFileId = update.state.field(fileField)
          setCurrentFileId(newFileId)
        }
      }),
      syntaxHighlighting(),
      search(),
      hyperLink,
    ]
  }, [settings.tabSize, currentFileId])

  // Only compute extensions that will be used in the editor
  const memoizedExtensions = useMemo(() => {
    return vimMode ? [...baseExtensions, vim()] : baseExtensions
  }, [baseExtensions, vimMode])

  // Memoize the basicSetup object
  const memoizedBasicSetup = useMemo(
    () => ({
      rectangularSelection: false,
      indentOnInput: true,
      syntaxHighlighting: true,
      highlightActiveLine: true,
      highlightSelectionMatches: true,
    }),
    [],
  )

  const onNewFile = useCallback(() => {
    setCurrentFileHandle(null)
    setMarkdownContent("") // Clear content for new file
    setIsEditMode(true)
    setPreviewNode(null) // Clear preview

    // Reset all note states for new file
    setNotes([])
    setDroppedNotes([])

    // Reset embedding processing flags
    essayEmbeddingProcessedRef.current = null

    setHasUnsavedChanges(false) // Reset unsaved changes
    // Set currentFileId to null for new file
    setCurrentFileId(null)

    // Clear the last file info from localStorage
    if (vaultId) {
      try {
        localStorage.removeItem(`morph:last-file:${vaultId}`)
      } catch (storageError) {
        console.error("Failed to clear file info from localStorage:", storageError)
      }
    }
  }, [vaultId])

  // Create a function to toggle settings that we can pass to Rails
  const toggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => !prev)
  }, [])

  // Handle removing a note from the notes array
  const handleNoteRemoved = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }, [])

  const noteGroupsData = useMemo(() => {
    // Filter out current generation notes and dropped notes
    const currentGenerationNoteIds = new Set(notes.map((note) => note.id))
    const droppedNoteIds = new Set(droppedNotes.map((note) => note.id))

    // Filter out both current generation notes and dropped notes
    const filteredNotes = notes.filter(
      (note) =>
        !currentGenerationNoteIds.has(note.id) && !droppedNoteIds.has(note.id) && !note.dropped,
    )

    return groupNotesByDate(filteredNotes)
  }, [notes, droppedNotes])

  // Memoize dropped notes to prevent unnecessary re-renders
  const memoizedDroppedNotes = useMemo(() => {
    return droppedNotes.map((note) => ({
      ...note,
      color: note.color || generatePastelColor(),
    }))
  }, [droppedNotes])

  // Handle dragging a dropped note back to the panel
  const handleNoteDragBackToPanel = useCallback(
    async (noteId: string) => {
      // Find the note in the droppedNotes
      const note = droppedNotes.find((n) => n.id === noteId)
      if (!note) {
        console.error(`Note with ID ${noteId} not found in droppedNotes`)
        return
      }

      // Update the note to indicate it's no longer dropped
      const undropNote = {
        ...note,
        dropped: false,
        lastModified: new Date(),
        // Preserve embedding status
        embeddingStatus: note.embeddingStatus || "in_progress",
        embeddingTaskId: note.embeddingTaskId,
      }

      // Remove from droppedNotes state
      setDroppedNotes((prev) => prev.filter((n) => n.id !== noteId))

      try {
        // Find the file in the database to make sure we have the right reference
        const dbFile = await db.query.files.findFirst({
          where: (files, { and, eq }) =>
            and(eq(files.id, currentFileId!), eq(files.vaultId, vault?.id || "")),
        })

        if (!dbFile) {
          console.error("Failed to find file in database when undropping note")
          return
        }

        // Update the database
        await db
          .update(schema.notes)
          .set({
            dropped: false,
            accessedAt: new Date(),
            fileId: dbFile.id, // Ensure we're using the database file ID
            // Preserve existing embedding values
            embeddingStatus: undropNote.embeddingStatus,
            embeddingTaskId: undropNote.embeddingTaskId,
          })
          .where(eq(schema.notes.id, noteId))

        // Add back to main notes collection if not already there
        setNotes((prevNotes) => {
          // If it exists, just update its dropped status
          if (prevNotes.some((n) => n.id === noteId)) {
            return prevNotes.map((n) =>
              n.id === noteId
                ? {
                    ...n,
                    dropped: false,
                    embeddingStatus: undropNote.embeddingStatus,
                    embeddingTaskId: undropNote.embeddingTaskId,
                  }
                : n,
            )
          } else {
            // Add to the beginning of the notes array to make it appear at the top
            return [undropNote, ...prevNotes]
          }
        })
      } catch (error) {
        console.error("Failed to update note status:", error)
      }
    },
    [droppedNotes, db, vault, currentFileId, setNotes],
  )

  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !codeMirrorViewRef.current || !node.handle) return

      try {
        console.log(`[Notes Debug] Selecting file: ${node.name} (${node.id})`)

        // Reset all note states when selecting a new file
        // This prevents stale notes from appearing temporarily
        setNotes([])
        setDroppedNotes([])

        // Reset embedding processing flags for new file selection
        essayEmbeddingProcessedRef.current = null

        const file = await node.handle!.getFile()
        const content = await file.text()

        // If the node doesn't have a handleId, create one and store it
        let handleId = node.handleId
        if (!handleId) {
          handleId = createId()
          // Store the handle for future use
          try {
            await storeHandle(handleId, vaultId, node.id, node.handle as FileSystemFileHandle)
          } catch (storeError) {
            console.error("Failed to store handle:", storeError)
            // Continue without storing - non-critical
          }
        } else {
          // Verify the existing handle is still valid
          try {
            const isValid = await verifyHandle(node.handle)
            if (!isValid) {
              await storeHandle(handleId, vaultId, node.id, node.handle as FileSystemFileHandle)
            }
          } catch (verifyError) {
            console.error("Failed to verify handle:", verifyError)
          }
        }

        // Set the fileId early so it can be used immediately
        const targetFileId = node.id
        setCurrentFileId(targetFileId)

        // Load file content - this should now find the correct file ID
        const success = await loadFileContent(
          targetFileId,
          node.handle as FileSystemFileHandle,
          content,
        )

        if (success) {
          console.log(`[Notes Debug] Successfully loaded content for file ${targetFileId}`)

          console.log(
            `[Notes Debug] Saving file info with ID: ${targetFileId}, handleId: ${handleId || node.id}`,
          )
          // Save the last accessed file info with the correct ID
          saveLastFileInfo(vaultId, targetFileId, handleId || node.id)

          // Update restored file in context for future restorations
          setRestoredFile({
            file,
            fileHandle: node.handle as FileSystemFileHandle,
            fileId: targetFileId,
            content,
            handleId: handleId || node.id,
          })

          // Process essay embeddings if needed
          if (targetFileId !== null) {
            try {
              // Skip if already being processed
              if (essayEmbeddingProcessedRef.current === `${vaultId}:${targetFileId}`) {
                console.log(
                  `[Notes Debug] Skipping duplicate essay embedding processing for ${node.name}`,
                )
                return
              }

              // Mark as processing immediately using ID
              essayEmbeddingProcessedRef.current = `${vaultId}:${targetFileId}`

              // Check if this file already has embeddings
              const hasEmbeddings = await checkFileHasEmbeddings(db, targetFileId)

              if (!hasEmbeddings) {
                console.log(`[Notes Debug] Processing essay embeddings for ${node.name}`)
                const cleaned = md(content).content
                processEssayEmbeddings.mutate({
                  addTask: addEssayTask,
                  currentContent: cleaned,
                  currentVaultId: vaultId,
                  currentFileId: targetFileId,
                })
              } else {
                console.log(
                  `[Notes Debug] File ${node.name} already has embeddings, skipping processing`,
                )
              }
            } catch (error) {
              console.error("Error processing file data:", error)
              // Reset flags on error to allow retrying
              essayEmbeddingProcessedRef.current = null
            }
          }
        } else {
          console.log(`[Notes Debug] Failed to load content for file ${targetFileId}`)
        }
      } catch (error) {
        console.error("Error handling file selection:", error)

        toast.error(`Could not load file ${node.name}. Please try again.`)
      }
    },
    [
      vault,
      vaultId,
      loadFileContent,
      storeHandle,
      db,
      addEssayTask,
      processEssayEmbeddings,
      setRestoredFile,
    ],
  )

  // Add the handler function (around line 500, with other handler functions)
  const handleVisibleContextNotesChange = useCallback((noteIds: string[]) => {
    setVisibleContextNoteIds(noteIds)
  }, [])

  const onContentChange = useCallback(
    async (value: string) => {
      // Only update hasUnsavedChanges if it's not already set
      // This prevents constant re-renders
      if (!hasUnsavedChanges && value !== contentRef.current.content) {
        setHasUnsavedChanges(true)
      }

      // Always update the current content
      setMarkdownContent(value)

      // Update preview with the new content using the debounced function
      debouncedUpdatePreview(value)
    },
    [debouncedUpdatePreview, hasUnsavedChanges, contentRef], // Use debounced function here
  )

  // Effect to use preloaded file from context if available
  useEffect(() => {
    if (!restoredFile || fileRestorationAttempted.current) return

    // Mark file as restored so we don't try again
    fileRestorationAttempted.current = true

    // Update local state even before CodeMirror is ready
    // These happen before async operations and are safe
    setMarkdownContent(restoredFile.content)
    setCurrentFileId(restoredFile.fileId)
    setCurrentFileHandle(restoredFile.fileHandle)
    setHasUnsavedChanges(false)

    // Update preview immediately with the restored content
    debouncedUpdatePreview(restoredFile.content)

    // Create flags to track processing status
    let embeddingProcessingStarted = false

    // If CodeMirror is ready, also update it
    if (codeMirrorViewRef.current) {
      // This will also set currentFileId via the loadFileContent function
      loadFileContent(restoredFile.fileId, restoredFile.fileHandle, restoredFile.content).then(
        async (success) => {
          // Load file metadata if content loading was successful and we have a valid file ID
          // Use the currentFileId set by loadFileContent
          if (success && vault && currentFileId) {
            try {
              // Reset note states *before* loading new metadata
              console.log(
                `[Notes Debug] Resetting notes state before loading metadata for ${currentFileId}`,
              )
              setNotes([])
              setDroppedNotes([])

              console.log(`[Notes Debug] Loading metadata for restored file: ${currentFileId}`)
              await loadFileContent(currentFileId, restoredFile.fileHandle, restoredFile.content)
              console.log(`[Notes Debug] Metadata loaded for ${currentFileId}`)

              // Log notes after metadata loading attempt
              await logNotesForFile(db, currentFileId, vaultId, "After restoring file")

              // Process essay embeddings for restored file (only if online)
              // Use a small timeout to let the file load completely first
              embeddingTimeoutRef.current = setTimeout(async () => {
                try {
                  // Skip if processing has already started or if file is already processed
                  if (
                    embeddingProcessingStarted ||
                    essayEmbeddingProcessedRef.current === `${vaultId}:${currentFileId}`
                  ) {
                    console.log(
                      `[Debug] Skipping duplicate essay embedding processing for restored file ${currentFileId}`,
                    )
                    return
                  }

                  // Mark as processing immediately
                  embeddingProcessingStarted = true
                  essayEmbeddingProcessedRef.current = `${vaultId}:${currentFileId}`

                  // Check if this file already has embeddings - use the current file ID
                  const hasEmbeddings = await checkFileHasEmbeddings(db, currentFileId!)

                  if (!hasEmbeddings) {
                    console.log(`[Debug] Processing embeddings for restored file ${currentFileId}`)
                    // Process essay embeddings asynchronously using the md content function
                    const content = md(restoredFile.content).content
                    processEssayEmbeddings.mutate({
                      addTask: addEssayTask,
                      currentContent: content,
                      currentVaultId: vaultId,
                      currentFileId: currentFileId!,
                    })
                  } else {
                    console.log(`[Debug] Restored file ${currentFileId} already has embeddings`)
                  }
                } catch (error) {
                  console.error(`Error processing file data for ${currentFileId}:`, error)
                  // Reset flags on error to allow retrying
                  essayEmbeddingProcessedRef.current = null
                }
              }, 1000) // 1 second delay to ensure DB operations are ready
            } catch (error) {
              console.error(`Error loading file metadata for ${currentFileId}:`, error)
              // If metadata loading fails, ensure the notes state remains cleared
              setNotes([])
              setDroppedNotes([])
            }
          }
        },
      )
    }

    // Cleanup timeout on unmount or if dependencies change
    return () => {
      if (embeddingTimeoutRef.current) {
        clearTimeout(embeddingTimeoutRef.current)
      }
    }
  }, [
    vaultId,
    restoredFile,
    loadFileContent,
    vault,
    db,
    processEssayEmbeddings,
    addEssayTask,
    debouncedUpdatePreview,
    currentFileId,
  ])

  // Update the ref when dependencies change, but don't recreate the event listener
  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      // Special handling for settings shortcut - high priority
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        event.stopPropagation() // Stop event from bubbling up
        toggleSettings()
        return
      }

      // Save shortcut should have priority
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        event.stopPropagation()
        handleSave()
        return
      }

      // Other keyboard shortcuts
      if (event.key === settings.toggleNotes && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleNotes()
      } else if (event.key === settings.toggleEditMode && (event.metaKey || event.altKey)) {
        event.preventDefault()
        setIsEditMode((prev) => !prev)
      }
    }
  }, [handleSave, toggleNotes, settings.toggleNotes, settings.toggleEditMode, toggleSettings])

  // Effect to update vimMode state when settings change
  useEffect(() => {
    // Only update vimMode if it differs from settings.vimMode
    if (settings.vimMode !== vimMode) {
      console.log("Updating vim mode from settings")
      setVimMode(settings.vimMode ?? false)
    }
  }, [settings.vimMode, vimMode])

  // Register vim commands separately to avoid type errors
  useEffect(() => {
    if (vimMode) {
      // Register our vim commands for saving
      Vim.defineEx("w", "w", () => {
        handleSave()
      })
      Vim.defineEx("wa", "wa", () => {
        handleSave()
      })
      // Register other vim commands
      Vim.map(";", ":", "normal")
      Vim.map("jj", "<Esc>", "insert")
      Vim.map("jk", "<Esc>", "insert")
    }
    return () => {
      // Clean up vim commands when dependencies change
      Vim.unmap(";", "normal")
      Vim.unmap("jj", "insert")
      Vim.unmap("jk", "insert")
    }
  }, [vimMode, handleSave])

  // Stable keyboard handler event listener setup
  useEffect(() => {
    // Create a stable handler that uses the current ref value
    const stableHandler = (e: KeyboardEvent) => {
      keyHandlerRef.current?.(e)
    }

    // Add event listener only once
    console.log("Registering keyboard handler")
    window.addEventListener("keydown", stableHandler, { capture: true })

    // Clean up on unmount only
    return () => {
      console.log("Removing keyboard handler")
      window.removeEventListener("keydown", stableHandler, { capture: true })
    }
  }, []) // Empty dependency array = run once on mount

  // Add an effect to update CodeMirror when vim mode changes
  useEffect(() => {
    // Only run if CodeMirror view is available
    if (codeMirrorViewRef.current) {
      console.log("Updating CodeMirror vim mode")

      // Instead of trying to query facets directly, just create a new state when mode changes
      const newState = EditorState.create({
        doc: codeMirrorViewRef.current.state.doc,
        selection: codeMirrorViewRef.current.state.selection,
        extensions: vimMode ? [...baseExtensions, vim()] : baseExtensions,
      })

      // Update the view with the new state
      codeMirrorViewRef.current.setState(newState)
    }
  }, [vimMode, baseExtensions]) // Only depend on vimMode and baseExtensions

  return (
    <DndProvider backend={HTML5Backend}>
      <SteeringProvider>
        <CustomDragLayer />
        <SearchProvider vault={vault!}>
          <SidebarProvider defaultOpen={false} className="flex min-h-screen">
            <Rails
              vault={vault!}
              editorViewRef={codeMirrorViewRef}
              onFileSelect={handleFileSelect}
              onNewFile={onNewFile}
              onContentUpdate={updatePreview}
              setIsSettingsOpen={toggleSettings}
            />
            <SidebarInset className="flex flex-col h-screen flex-1 overflow-hidden">
              <section className="flex flex-1 overflow-hidden m-4 border rounded-[8px]">
                <NoteEmbeddingProcessor db={db} />
                <EssayEmbeddingProcessor db={db} />
                <AuthorProcessor />
                <AnimatePresence initial={false}>
                  {showEphemeralBanner && (
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-md shadow-md text-xs flex items-center space-x-2"
                    >
                      <span>
                        📝 Suggestions are ephemeral and will be{" "}
                        <span className="text-red-400">lost</span> unless the file is saved (
                        <kbd>⌘ s</kbd>)
                      </span>
                      <button
                        onClick={() => setShowEphemeralBanner(false)}
                        className="text-yellow-800 hover:text-yellow-900 hover:cursor-pointer"
                        aria-label="Dismiss notification"
                      >
                        <Cross2Icon className="w-3 h-3" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Author processing indicator */}
                <AnimatePresence initial={false}>
                  {isAuthorProcessing && (
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="absolute top-2 right-2 z-50 bg-blue-100 border border-blue-300 text-blue-800 px-4 py-2 rounded-md shadow-md text-xs flex items-center space-x-2"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4 text-blue-600"
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
                        Building document context for better suggestions...
                      </span>
                      <button
                        onClick={() => setIsAuthorProcessing(false)}
                        className="text-blue-600 hover:text-blue-800 hover:cursor-pointer"
                        aria-label="Dismiss notification"
                      >
                        <Cross2Icon className="w-3 h-3" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <EditorDropTarget handleNoteDropped={handleNoteDropped}>
                  <DroppedNoteGroup
                    droppedNotes={memoizedDroppedNotes}
                    isStackExpanded={isStackExpanded}
                    onExpandStack={toggleStackExpand}
                    onDragBackToPanel={handleNoteDragBackToPanel}
                    className="before:mix-blend-multiply before:bg-noise-pattern"
                    visibleContextNoteIds={visibleContextNoteIds}
                  />
                  <div className="flex flex-col items-center space-y-2 absolute bottom-2 right-2 z-20">
                    <VaultButton
                      onClick={toggleNotes}
                      size="small"
                      title={showNotes ? "Hide Notes" : "Show Notes"}
                    >
                      <CopyIcon className="w-3 h-3" />
                    </VaultButton>
                  </div>
                  <div className="absolute top-2 left-2 text-sm/7 z-10 flex flex-col items-start justify-self gap-2">
                    {hasUnsavedChanges && <DotIcon className="text-yellow-200" />}
                  </div>
                  {vault && currentFileId !== null && memoizedDroppedNotes.length > 0 && (
                    <ContextNotes
                      className={`${isEditMode ? "block" : "hidden"}`}
                      editorViewRef={codeMirrorViewRef}
                      readingModeRef={readingModeRef}
                      droppedNotes={memoizedDroppedNotes}
                      isEditMode={isEditMode}
                      fileId={currentFileId}
                      vaultId={vaultId}
                      onVisibleNotesChange={handleVisibleContextNotesChange}
                    />
                  )}
                  <div
                    className={`editor-mode absolute inset-0 ${isEditMode ? "block" : "hidden"}`}
                  >
                    <div className="h-full scrollbar-hidden relative">
                      <CodeMirror
                        value={markdownContent}
                        height="100%"
                        autoFocus
                        placeholder={"What's on your mind?"}
                        basicSetup={memoizedBasicSetup} // Use memoized object
                        indentWithTab={true}
                        extensions={memoizedExtensions}
                        onChange={onContentChange}
                        className="overflow-auto h-full mx-8 scrollbar-hidden pt-2"
                        theme={theme === "dark" ? "dark" : editorTheme}
                        onCreateEditor={(view) => {
                          codeMirrorViewRef.current = view
                        }}
                      />
                    </div>
                  </div>
                  <div
                    className={`reading-mode absolute inset-0 ${isEditMode ? "hidden" : "block overflow-hidden"}`}
                    ref={readingModeRef}
                  >
                    <div className="prose dark:prose-invert h-full mr-8 overflow-auto scrollbar-hidden">
                      <article className="@container h-full max-w-5xl mx-auto scrollbar-hidden mt-4">
                        {previewNode && toJsx(previewNode)}
                      </article>
                    </div>
                  </div>
                </EditorDropTarget>
                {showNotes && currentFileId !== null && (
                  <div
                    ref={notesContainerRef}
                    className={cn("flex flex-col", showNotes ? "w-88 visible" : "w-0 hidden")}
                  >
                    <NotesPanel
                      notes={notes}
                      droppedNotes={droppedNotes}
                      fileId={currentFileId}
                      vaultId={vault.id}
                      handleNoteDropped={handleNoteDropped}
                      handleNoteRemoved={handleNoteRemoved}
                      noteGroupsData={noteGroupsData}
                      notesContainerRef={notesContainerRef}
                      markdownContent={markdownContent}
                      currentFileHandle={currentFileHandle}
                    />
                  </div>
                )}
              </section>
              <SearchCommand
                maps={flattenedFileIds}
                vault={vault!}
                onFileSelect={handleFileSelect}
              />
            </SidebarInset>
          </SidebarProvider>
          <SettingsPanel
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            setIsOpen={setIsSettingsOpen}
          />
        </SearchProvider>
      </SteeringProvider>
    </DndProvider>
  )
})
