"use client"

import { cn, toJsx } from "@/lib"
import { groupNotesByDate } from "@/lib/notes"
import { checkFileHasEmbeddings, useProcessPendingEssayEmbeddings } from "@/services/essays"
import { logNotesForFile } from "@/services/notes"
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
import { and, eq } from "drizzle-orm"
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
import { useNotesContext } from "@/context/notes"
import { SearchProvider } from "@/context/search"
import { SteeringProvider } from "@/context/steering"
import { useVaultContext } from "@/context/vault"
import { verifyHandle } from "@/context/vault-reducer"

import useFsHandles from "@/hooks/use-fs-handles"
import usePersistedSettings from "@/hooks/use-persisted-settings"

import type { Settings } from "@/db/interfaces"
import type { FileSystemTreeNode, Vault } from "@/db/interfaces"
import * as schema from "@/db/schema"

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

function saveLastFileInfo(vaultId: string | null, fileId: string | null, handleId: string) {
  if (!vaultId || !fileId) return
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

async function renderHastNode(value: string, settings: Settings, vaultId: string, fileId: string) {
  try {
    return await mdToHtml({
      value,
      settings,
      vaultId,
      fileId,
      returnHast: true,
    })
  } catch (error) {
    console.error(error)
    throw error
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
  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [isStackExpanded, setIsStackExpanded] = useState(false)
  const [vimMode, setVimMode] = useState(settings.vimMode ?? false)
  // Add a ref to track if we've already attempted to restore a file
  const fileRestorationAttempted = useRef(false)
  // Add a state for visible context note IDs (around line 150, with other state declarations)
  const [visibleContextNoteIds, setVisibleContextNoteIds] = useState<string[]>([])
  // Add state for author understanding indicator
  const [isAuthorProcessing, setIsAuthorProcessing] = useState(false)

  // Use the notes context instead of local state
  const {
    state: { droppedNotes, notes, currentGenerationNotes, currentFileId, dbFile: dbFileState },
    dispatch,
    handleNoteDropped,
    handleNoteRemoved,
    loadFileMetadata,
    updateDbFile,
  } = useNotesContext()

  const client = usePGlite()
  const db = drizzle({ client, schema })

  const vault = vaults.find((v) => v.id === vaultId)

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
    if (restoredFile && restoredFile.fileId)
      dispatch({ type: "SET_CURRENT_FILE_ID", fileId: restoredFile.fileId })
  }, [restoredFile, dispatch])

  // Define updateContentRef function that updates content without logging
  const updateContentRef = useCallback(() => {
    contentRef.current = { content: markdownContent }
  }, [markdownContent])

  const toggleStackExpand = useCallback(() => {
    setIsStackExpanded((prev) => !prev)
  }, [])

  const updatePreview = useCallback(
    async (content: string) => {
      const tree = await renderHastNode(content, settings, vaultId, currentFileId!)
      setPreviewNode(tree)
    },
    [currentFileId, settings, vaultId],
  )

  // Debounce the preview update function
  const debouncedUpdatePreview = useDebouncedCallback(updatePreview, 300) // 300ms debounce delay

  // Helper function to load file content and UI state
  const loadFileContent = useCallback(
    (fileId: string, fileHandle: FileSystemFileHandle, content: string) => {
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
        dispatch({ type: "SET_CURRENT_FILE_ID", fileId })
        setMarkdownContent(content)
        setHasUnsavedChanges(false)
        setIsEditMode(true)
        // Update preview
        debouncedUpdatePreview(content)
        return true
      } catch (error) {
        console.error("Error loading file content:", error)
        return false
      }
    },
    [debouncedUpdatePreview, dispatch],
  )

  const toggleNotes = useCallback(() => {
    setShowNotes(!showNotes)
  }, [showNotes])

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
            dispatch({ type: "SET_CURRENT_FILE_ID", fileId: dbFileId })
            setCurrentFileHandle(targetHandle)

            // Refresh the vault to show the new file
            await refreshVault(vaultId)

            // Update fileId to use the DB one for localStorage
            fileId = dbFileId
          }
        } catch (dbError) {
          console.error("Error creating file in database:", dbError)
          // If database save fails, still update local state
          dispatch({ type: "SET_CURRENT_FILE_ID", fileId: fileId })
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

      // Refresh metadata to update notes
      if (fileId) {
        await loadFileMetadata(fileId)
      }

      // Update the content reference only after successful save
      updateContentRef()

      // Reset unsaved changes flag
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error("Error saving file:", error)
    }
  }, [
    dispatch,
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
    loadFileMetadata,
  ])

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
      dispatch({ type: "REMOVE_DROPPED_NOTE", noteId })

      try {
        // Ensure we have a valid dbFile
        const dbFile = dbFileState || (await updateDbFile(currentFileId))
        if (!dbFile) {
          console.error("DB file not found when trying to move note back to panel")
          return
        }

        // Update the database
        await db
          .update(schema.notes)
          .set({
            dropped: false,
            accessedAt: new Date(),
            fileId: dbFile.id,
            // Preserve existing embedding values
            embeddingStatus: undropNote.embeddingStatus,
            embeddingTaskId: undropNote.embeddingTaskId,
          })
          .where(eq(schema.notes.id, noteId))

        // Add back to main notes collection
        dispatch({ type: "ADD_NOTES", notes: [undropNote] })
      } catch (error) {
        console.error("Failed to update note status:", error)
      }
    },
    [droppedNotes, db, currentFileId, dbFileState, dispatch, updateDbFile],
  )

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
          dispatch({ type: "SET_CURRENT_FILE_ID", fileId: newFileId })
        }
      }),
      syntaxHighlighting(),
      search(),
      hyperLink,
    ]
  }, [settings.tabSize, currentFileId, dispatch])

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

    // Reset embedding processing flags
    essayEmbeddingProcessedRef.current = null

    setHasUnsavedChanges(false) // Reset unsaved changes
    // Set currentFileId to null for new file
    dispatch({ type: "SET_CURRENT_FILE_ID", fileId: null })
    // Also reset dbFile state for new file
    dispatch({ type: "SET_DB_FILE", dbFile: null })

    // Clear the last file info from localStorage
    if (vaultId) {
      try {
        localStorage.removeItem(`morph:last-file:${vaultId}`)
      } catch (storageError) {
        console.error("Failed to clear file info from localStorage:", storageError)
      }
    }
  }, [vaultId, dispatch])

  // Create a function to toggle settings that we can pass to Rails
  const toggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => !prev)
  }, [])

  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !codeMirrorViewRef.current || !node.handle) return

      try {
        console.debug(`[Notes Debug] Selecting file: ${node.name} (${node.id})`)

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

        // Update file ID in notes context
        dispatch({ type: "SET_CURRENT_FILE_ID", fileId: targetFileId })

        // Update dbFile state when selecting a new file
        await updateDbFile(targetFileId)
          .catch((error) => {
            console.error("Error updating dbFile during file selection:", error)
          })
          .then()

        // Load file content - this should now find the correct file ID
        const success = loadFileContent(targetFileId, node.handle as FileSystemFileHandle, content)

        if (success) {
          console.debug(`[Notes Debug] Successfully loaded content for file ${targetFileId}`)

          console.debug(
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

          // Load file metadata to populate notes
          try {
            await loadFileMetadata(targetFileId)
            console.debug(`[Notes Debug] Loaded metadata for file ${targetFileId}`)
          } catch (metadataError) {
            console.error(
              `[Notes Debug] Error loading metadata for file ${targetFileId}:`,
              metadataError,
            )
          }

          // Process essay embeddings if needed
          if (targetFileId !== null) {
            try {
              // Skip if already being processed
              if (essayEmbeddingProcessedRef.current === `${vaultId}:${targetFileId}`) {
                console.debug(
                  `[Notes Debug] Skipping duplicate essay embedding processing for ${node.name}`,
                )
                return
              }

              // Mark as processing immediately using ID
              essayEmbeddingProcessedRef.current = `${vaultId}:${targetFileId}`

              // Check if this file already has embeddings
              const hasEmbeddings = await checkFileHasEmbeddings(db, targetFileId)

              if (!hasEmbeddings) {
                console.debug(`[Notes Debug] Processing essay embeddings for ${node.name}`)
                const cleaned = md(content).content
                processEssayEmbeddings.mutate({
                  addTask: addEssayTask,
                  currentContent: cleaned,
                  currentVaultId: vaultId,
                  currentFileId: targetFileId,
                })
              } else {
                console.debug(
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
          console.debug(`[Notes Debug] Failed to load content for file ${targetFileId}`)
        }
      } catch (error) {
        console.error("Error handling file selection:", error)

        toast.error(`Could not load file ${node.name}. Please try again.`)
      }
    },
    [
      dispatch,
      vault,
      vaultId,
      loadFileContent,
      storeHandle,
      db,
      addEssayTask,
      processEssayEmbeddings,
      setRestoredFile,
      updateDbFile,
      loadFileMetadata,
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

    // Update preview immediately with the restored content
    debouncedUpdatePreview(restoredFile.content)

    // Create flags to track processing status
    let embeddingProcessingStarted = false

    // Set the initial states synchronously
    setMarkdownContent(restoredFile.content)
    dispatch({ type: "SET_CURRENT_FILE_ID", fileId: restoredFile.fileId })
    setCurrentFileHandle(restoredFile.fileHandle)
    setHasUnsavedChanges(false)

    const loadFile = async () => {
      // This will also set currentFileId via the loadFileContent function
      const success = loadFileContent(
        restoredFile.fileId,
        restoredFile.fileHandle,
        restoredFile.content,
      )

      // Use restoredFile.fileId directly instead of currentFileId
      const targetFileId = restoredFile.fileId

      if (success && targetFileId) {
        try {
          // Reset note states *before* loading new metadata
          console.debug(
            `[Notes Debug] Resetting notes state before loading metadata for ${targetFileId}`,
          )

          console.debug(`[Notes Debug] Loading metadata for restored file: ${targetFileId}`)
          // Load file metadata to populate notes
          await loadFileMetadata(targetFileId)
          console.debug(`[Notes Debug] Metadata loaded for ${targetFileId}`)

          // Log notes after metadata loading attempt
          await logNotesForFile(db, targetFileId, vaultId, "After restoring file")

          // Process essay embeddings for restored file (only if online)
          // Use a small timeout to let the file load completely first
          embeddingTimeoutRef.current = setTimeout(async () => {
            try {
              // Skip if processing has already started or if file is already processed
              if (
                embeddingProcessingStarted ||
                essayEmbeddingProcessedRef.current === `${vaultId}:${targetFileId}`
              ) {
                console.debug(
                  `[Debug] Skipping duplicate essay embedding processing for restored file ${targetFileId}`,
                )
                return
              }

              // Mark as processing immediately
              embeddingProcessingStarted = true
              essayEmbeddingProcessedRef.current = `${vaultId}:${targetFileId}`

              // Check if this file already has embeddings - use the target file ID
              const hasEmbeddings = await checkFileHasEmbeddings(db, targetFileId)

              if (!hasEmbeddings) {
                console.debug(`[Debug] Processing embeddings for restored file ${targetFileId}`)
                // Process essay embeddings asynchronously using the md content function
                const content = md(restoredFile.content).content
                processEssayEmbeddings.mutate({
                  addTask: addEssayTask,
                  currentContent: content,
                  currentVaultId: vaultId,
                  currentFileId: targetFileId,
                })
              } else {
                console.debug(`[Debug] Restored file ${targetFileId} already has embeddings`)
              }
            } catch (error) {
              console.error(`Error processing file data for ${targetFileId}:`, error)
              // Reset flags on error to allow retrying
              essayEmbeddingProcessedRef.current = null
            }
          }, 1000) // 1 second delay to ensure DB operations are ready
        } catch (error) {
          console.error(`Error loading file metadata for ${targetFileId}:`, error)
        }
      }
    }

    const loadingFile = setTimeout(loadFile, 1000)
    // Cleanup timeout on unmount or if dependencies change
    return () => {
      if (embeddingTimeoutRef.current) {
        clearTimeout(embeddingTimeoutRef.current)
        clearTimeout(loadingFile)
      }
    }
  }, [
    dispatch,
    vaultId,
    restoredFile,
    loadFileContent,
    vault,
    db,
    processEssayEmbeddings,
    addEssayTask,
    debouncedUpdatePreview,
    currentFileId,
    loadFileMetadata,
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
      console.debug("Updating vim mode from settings")
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
    console.debug("Registering keyboard handler")
    window.addEventListener("keydown", stableHandler, { capture: true })

    // Clean up on unmount only
    return () => {
      console.debug("Removing keyboard handler")
      window.removeEventListener("keydown", stableHandler, { capture: true })
    }
  }, [])

  // Add an effect to update CodeMirror when vim mode changes
  useEffect(() => {
    // Only run if CodeMirror view is available
    if (codeMirrorViewRef.current) {
      console.debug("Updating CodeMirror vim mode")

      // Instead of trying to query facets directly, just create a new state when mode changes
      const newState = EditorState.create({
        doc: codeMirrorViewRef.current.state.doc,
        selection: codeMirrorViewRef.current.state.selection,
        extensions: vimMode ? [...baseExtensions, vim()] : baseExtensions,
      })

      // Update the view with the new state
      codeMirrorViewRef.current.setState(newState)
    }
  }, [vimMode, baseExtensions])

  const noteGroupsData = useMemo(() => {
    // Filter out current generation notes and dropped notes
    const currentGenerationNoteIds = new Set(currentGenerationNotes.map((note) => note.id))
    const droppedNoteIds = new Set(droppedNotes.map((note) => note.id))

    // Filter out both current generation notes and dropped notes
    const filteredNotes = notes.filter(
      (note) =>
        !currentGenerationNoteIds.has(note.id) && !droppedNoteIds.has(note.id) && !note.dropped,
    )

    return groupNotesByDate(filteredNotes)
  }, [droppedNotes, notes, currentGenerationNotes])

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
                    droppedNotes={droppedNotes}
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
                  {droppedNotes.length > 0 && (
                    <ContextNotes
                      className={`${isEditMode ? "block" : "hidden"}`}
                      editorViewRef={codeMirrorViewRef}
                      readingModeRef={readingModeRef}
                      isEditMode={isEditMode}
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
                {showNotes && (
                  <div
                    className={cn("flex flex-col", showNotes ? "w-88 visible" : "w-0 hidden")}
                  >
                    <NotesPanel
                      handleNoteDropped={handleNoteDropped}
                      handleNoteRemoved={handleNoteRemoved}
                      noteGroupsData={noteGroupsData}
                      droppedNotes={droppedNotes}
                      fileId={currentFileId!}
                      vaultId={vaultId}
                      markdownContent={markdownContent}
                      currentFileHandle={currentFileHandle}
                      dbFile={dbFileState}
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
