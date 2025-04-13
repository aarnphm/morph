"use client"

import { cn, toJsx } from "@/lib"
import { groupNotesByDate } from "@/lib/notes"
import { checkFileHasEmbeddings, useProcessPendingEssayEmbeddings } from "@/services/essays"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { Compartment, EditorState } from "@codemirror/state"
import { keymap } from "@codemirror/view"
import { EditorView } from "@codemirror/view"
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
import { EmbeddingStatus } from "@/components/embedding-status"
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
import { useNotesContext } from "@/context/notes"
import { SearchProvider } from "@/context/search"
import { SteeringProvider } from "@/context/steering"
import { useVaultContext, useVaultDispatch } from "@/context/vault"
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

function saveLastFileInfo(vaultId: string | null, fileId: string | null) {
  if (!vaultId || !fileId) {
    if (vaultId) localStorage.removeItem(`morph:last-file:${vaultId}`)
    return
  }
  try {
    localStorage.setItem(
      `morph:last-file:${vaultId}`,
      JSON.stringify({
        lastAccessed: new Date().toISOString(),
        fileId,
      }),
    )
    console.debug(`[Editor] Saved last file info for vault ${vaultId}: fileId=${fileId}`)
  } catch (storageError) {
    console.error("Failed to save file info to localStorage:", storageError)
  }
}

async function renderHastNode(value: string, settings: Settings, vaultId: string, fileId: string) {
  if (!fileId) {
    console.warn("[renderHastNode] Attempted to render with null fileId.")
    return null
  }
  try {
    return await mdToHtml({
      value,
      settings,
      vaultId,
      fileId,
      returnHast: true,
    })
  } catch (error) {
    console.error("Error rendering HAST node:", error)
    throw error
  }
}

// Helper function (can be placed outside the component or in a utils file)
function findNodeByIdRecursive(node: FileSystemTreeNode | undefined, id: string): FileSystemTreeNode | null {
  if (!node) {
    return null;
  }
  if (node.id === id) {
    return node;
  }
  if (node.kind === 'directory' && node.children) {
    for (const child of node.children) {
      const found = findNodeByIdRecursive(child, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export default memo(function Editor({ vaultId }: EditorProps) {
  const { theme } = useTheme()
  const { storeHandle } = useFsHandles()
  const { settings } = usePersistedSettings()

  const { flattenedFileIds, getActiveVault } = useVaultContext()
  const vaultDispatch = useVaultDispatch()

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
  const [visibleContextNoteIds, setVisibleContextNoteIds] = useState<string[]>([])
  const [isAuthorProcessing, setIsAuthorProcessing] = useState(false)
  const [embeddingStatus, setEmbeddingStatus] = useState<
    "in_progress" | "success" | "failure" | "cancelled" | null
  >(null)

  const {
    state: { droppedNotes, notes, currentGenerationNotes, currentFileId, dbFile },
    dispatch: notesDispatch,
    handleNoteDropped,
    handleNoteRemoved,
    loadFileMetadata,
    updateDbFile,
  } = useNotesContext()

  const client = usePGlite()
  const db = drizzle({ client, schema })

  const vault = getActiveVault()
  const currentVaultId = vaultId

  const processEssayEmbeddings = useProcessPendingEssayEmbeddings(db)

  const contentRef = useRef({ content: "" })

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})

  const essayEmbeddingProcessedRef = useRef<string | null>(null)

  const lastEmbeddingProcessedTimestampRef = useRef<Record<string, number>>({})

  const { addTask, pendingTaskIds } = useEssayEmbeddingTasks()

  const updateContentRef = useCallback((content: string) => {
    contentRef.current = { content }
  }, [])

  const updatePreview = useDebouncedCallback(
    useCallback(
      async (content: string) => {
        if (!currentVaultId || !currentFileId) return
        const tree = await renderHastNode(content, settings, currentVaultId, currentFileId)
        setPreviewNode(tree)
      },
      [currentFileId, settings, currentVaultId],
    ),
    300,
  )

  const loadFileContent = useCallback(
    async (fileId: string, fileHandle: FileSystemFileHandle, content: string) => {
      if (!codeMirrorViewRef.current || !currentVaultId) return false

      try {
        const existingFile = await db.query.files.findFirst({
          where: (files, { and, eq }) =>
            and(eq(files.id, fileId), eq(files.vaultId, currentVaultId)),
        })

        if (existingFile) {
          notesDispatch({ type: "SET_DB_FILE", dbFile: existingFile })
        }

        codeMirrorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: codeMirrorViewRef.current.state.doc.length,
            insert: content,
          },
          effects: setFile.of(fileId),
        })

        setCurrentFileHandle(fileHandle)
        notesDispatch({ type: "SET_CURRENT_FILE_ID", fileId })
        setMarkdownContent(content)
        setHasUnsavedChanges(false)
        setIsEditMode(true)
        updatePreview(content)
        return true
      } catch (error) {
        console.error(`Error loading file content for ${fileId}:`, error)
        toast.error(`Failed to load file content for ${fileId}.`)
        return false
      }
    },
    [updatePreview, notesDispatch, db, currentVaultId],
  )

  const toggleNotes = useCallback(() => {
    setShowNotes(!showNotes)
  }, [showNotes])

  const handleSave = useCallback(async () => {
    if (!currentVaultId) {
      toast.error("Cannot save: No active vault selected.")
      return
    }

    try {
      let targetHandle = currentFileHandle
      let fileIdToSave = currentFileId
      let isNewFile = false
      let relativePath = ""

      if (!targetHandle || !fileIdToSave) {
        isNewFile = true

        targetHandle = await window.showSaveFilePicker({
          id: "morph-save-picker",
          suggestedName: `untitled.md`,
          types: [
            {
              description: "Markdown Files",
              accept: { "text/markdown": [".md"] },
            },
          ],
        })

        // New files are conceptually saved at root for now
        // TODO: change this to save to the current directory
        relativePath = `/${targetHandle.name}`
        fileIdToSave = `${currentVaultId}:${relativePath}`

        await storeHandle(currentVaultId, fileIdToSave, targetHandle)
      } else {
        // Use recursive search instead of shallow search
        const node = findNodeByIdRecursive(vault?.tree, fileIdToSave);
        if (node && node.kind === 'file') { // Ensure it's a file node
          relativePath = node.path
        } else {
          console.error(
            `[Editor] Could not find existing file node for ID: ${fileIdToSave} or it's not a file. Cannot determine path.`,
          )
          toast.error("Error: Could not find file data to save properly.")
          return
        }
      }

      // Get the latest content directly from CodeMirror
      const currentEditorContent = codeMirrorViewRef.current?.state.doc.toString() || markdownContent

      const writable = await targetHandle.createWritable()
      await writable.write(currentEditorContent) // Use the direct content here
      await writable.close()

      const filename = targetHandle.name
      const match = filename.match(/^(.+?)(\.[^.]*)?$/)
      const baseName = match?.[1] || filename
      const extension = match?.[2]?.replace(/^\./, "") || ""

      const fileData = {
        id: fileIdToSave,
        name: baseName,
        extension,
        vaultId: currentVaultId,
        lastModified: new Date(),
        embeddingStatus: "in_progress" as const,
      }

      try {
        if (isNewFile) {
          // Insert new file metadata
          await db.insert(schema.files).values(fileData)
          console.debug(`[Editor] Inserted new file metadata for ${fileIdToSave} in DB.`)
        } else {
          // Update existing file metadata
          await db
            .update(schema.files)
            .set({
              name: fileData.name,
              extension: fileData.extension,
              lastModified: fileData.lastModified,
              embeddingStatus: fileData.embeddingStatus, // Keep updating status on save for now
            })
            .where(
              and(eq(schema.files.id, fileIdToSave), eq(schema.files.vaultId, currentVaultId)),
            )
          console.debug(`[Editor] Updated file metadata for ${fileIdToSave} in DB.`)
        }
      } catch (dbError) {
        console.error("Error upserting file metadata:", dbError)
        toast.error("Failed to update file metadata in database.")
        // Consider if we should proceed if DB update fails. Maybe not?
        // return; // Uncomment if DB failure should stop the process
      }

      if (isNewFile) {
        const newNode: FileSystemTreeNode = {
          id: fileIdToSave,
          name: baseName,
          extension,
          kind: "file",
          path: relativePath,
          handle: targetHandle,
        }
        vaultDispatch({ type: "ADD_FILE_NODE", vaultId: currentVaultId, node: newNode })
        console.debug(`[Editor] Dispatched ADD_FILE_NODE for ${fileIdToSave}`)

        notesDispatch({ type: "SET_CURRENT_FILE_ID", fileId: fileIdToSave })
        setCurrentFileHandle(targetHandle)
        await updateDbFile(fileIdToSave)
      } else {
        await updateDbFile(fileIdToSave)
      }

      saveLastFileInfo(currentVaultId, fileIdToSave)

      updateContentRef(currentEditorContent) // Update ref with saved content
      setMarkdownContent(currentEditorContent) // Sync state with saved content
      setHasUnsavedChanges(false)
      toast.success("File saved successfully!")

      const currentTime = Date.now()
      const fileKey = `${currentVaultId}:${fileIdToSave}`
      const lastProcessed = lastEmbeddingProcessedTimestampRef.current[fileKey] || 0
      const timeSinceLastProcess = currentTime - lastProcessed
      const RATE_LIMIT_MS = 3 * 60 * 1000

      if (isNewFile || timeSinceLastProcess > RATE_LIMIT_MS) {
        console.debug(`[Editor] Processing essay embeddings on save for ${fileIdToSave}`)
        try {
          const content = md(currentEditorContent).content // Use the direct content for embedding
          lastEmbeddingProcessedTimestampRef.current[fileKey] = currentTime
          processEssayEmbeddings.mutate({
            addTask: addTask,
            currentContent: content,
            currentVaultId: currentVaultId,
            currentFileId: fileIdToSave,
          })
        } catch (error) {
          console.error("Error processing essay embeddings on save:", error)
        }
      } else {
        console.debug(
          `[Editor] Skipping embedding update due to rate limiting (${Math.round(
            timeSinceLastProcess / 1000,
          )}s < ${RATE_LIMIT_MS / 1000}s)`,
        )
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("[Editor] File save cancelled by user.")
        return
      }
      console.error("Error saving file:", error)
      toast.error(`Error saving file: ${error.message}`)
    }
  }, [
    currentVaultId,
    currentFileId,
    currentFileHandle,
    markdownContent,
    storeHandle,
    db,
    vaultDispatch,
    notesDispatch,
    updateContentRef,
    processEssayEmbeddings,
    addTask,
    vault,
    updateDbFile,
  ])

  const handleNoteDragBackToPanel = useCallback(
    async (noteId: string) => {
      if (!currentFileId) {
        console.warn("[handleNoteDragBackToPanel] No current file ID, cannot associate note.")
        return
      }

      const note = droppedNotes.find((n) => n.id === noteId)
      if (!note) {
        console.error(`Note with ID ${noteId} not found in droppedNotes`)
        return
      }

      const undropNote = {
        ...note,
        dropped: false,
        lastModified: new Date(),
        embeddingStatus: note.embeddingStatus || "in_progress",
        embeddingTaskId: note.embeddingTaskId,
      }

      notesDispatch({ type: "REMOVE_DROPPED_NOTE", noteId })

      try {
        await db
          .update(schema.notes)
          .set({
            dropped: false,
            accessedAt: new Date(),
            fileId: currentFileId,
            embeddingStatus: undropNote.embeddingStatus,
            embeddingTaskId: undropNote.embeddingTaskId,
          })
          .where(eq(schema.notes.id, noteId))

        notesDispatch({ type: "ADD_NOTES", notes: [undropNote] })
      } catch (error) {
        console.error("Failed to update note status:", error)
        toast.error("Failed to move note back to panel.")
      }
    },
    [droppedNotes, db, currentFileId, notesDispatch],
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
          const newFileId = update.state.field(fileField)
          if (newFileId !== currentFileId) {
            console.debug(
              "[CodeMirror Listener] fileField changed, updating notes context:",
              newFileId,
            )
            notesDispatch({ type: "SET_CURRENT_FILE_ID", fileId: newFileId })
          }
        }
      }),
      syntaxHighlighting(),
      search(),
      hyperLink,
    ]
  }, [settings.tabSize, currentFileId, notesDispatch])

  const memoizedExtensions = useMemo(() => {
    return settings.vimMode ? [...baseExtensions, vim()] : baseExtensions
  }, [baseExtensions, settings.vimMode])

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
    console.debug("[Editor] Creating new file.")
    setCurrentFileHandle(null)
    setMarkdownContent("")
    setIsEditMode(true)
    setPreviewNode(null)
    essayEmbeddingProcessedRef.current = null
    setHasUnsavedChanges(false)
    notesDispatch({ type: "SET_CURRENT_FILE_ID", fileId: null })
    notesDispatch({ type: "SET_DB_FILE", dbFile: null })

    if (currentVaultId) {
      saveLastFileInfo(currentVaultId, null)
    }
  }, [currentVaultId, notesDispatch])

  const toggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => !prev)
  }, [])

  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !node.handle || !currentVaultId) {
        console.warn("[Editor] handleFileSelect precondition failed:", {
          vaultExists: !!vault,
          nodeKind: node.kind,
          nodeHandleExists: !!node.handle,
          currentVaultId,
        })
        return
      }

      const selectedFileId = node.id

      try {
        console.debug(`[Editor] Selecting file: ${node.name} (${selectedFileId})`)

        if (currentFileId && hasUnsavedChanges) {
          console.debug(
            `[Editor] Auto-saving current file (${currentFileId}) due to unsaved changes before switching.`,
          )
          try {
            await handleSave()
          } catch (saveError) {
            console.error("Error auto-saving current file before switching:", saveError)
            toast.error("Failed to save previous file before switching.")
            return
          }
        }

        essayEmbeddingProcessedRef.current = null

        const fileHandle = node.handle as FileSystemFileHandle
        const file = await fileHandle.getFile()
        const content = await file.text()

        console.debug(`[Editor] Read content for ${selectedFileId}`)

        try {
          const isValid = await verifyHandle(fileHandle)
          if (!isValid) {
            console.warn(
              `[Editor] Handle for file ${selectedFileId} needs permission or is invalid, attempting to re-store.`,
            )
          }
          await storeHandle(currentVaultId, selectedFileId, fileHandle)
          console.debug(`[Editor] Verified and stored handle for ${selectedFileId}`)
        } catch (storeError) {
          console.error(`Failed to store handle for ${selectedFileId}:`, storeError)
        }

        await updateDbFile(selectedFileId)

        const success = await loadFileContent(selectedFileId, fileHandle, content)

        if (success) {
          console.debug(`[Editor] Successfully loaded content for file ${selectedFileId}`)

          // Load associated notes and reasoning after file content is loaded
          await loadFileMetadata(selectedFileId)
          console.debug(`[Editor] Dispatched action to load metadata for ${selectedFileId}`)

          saveLastFileInfo(currentVaultId, selectedFileId)

          try {
            if (essayEmbeddingProcessedRef.current === `${currentVaultId}:${selectedFileId}`) {
              console.debug(
                `[Editor] Skipping duplicate essay embedding processing check for ${node.name}`,
              )
              return
            }

            essayEmbeddingProcessedRef.current = `${currentVaultId}:${selectedFileId}`

            const hasEmbeddings = await checkFileHasEmbeddings(db, selectedFileId)

            if (!hasEmbeddings) {
              console.debug(
                `[Editor] Processing essay embeddings for ${node.name} (${selectedFileId})`,
              )
              const cleaned = md(content).content

              await db
                .update(schema.files)
                .set({ embeddingStatus: "in_progress" })
                .where(
                  and(
                    eq(schema.files.id, selectedFileId),
                    eq(schema.files.vaultId, currentVaultId),
                  ),
                )

              processEssayEmbeddings.mutate({
                addTask: addTask,
                currentContent: cleaned,
                currentVaultId: currentVaultId,
                currentFileId: selectedFileId,
              })
            } else {
              console.debug(
                `[Editor] File ${node.name} (${selectedFileId}) already has embeddings, skipping processing.`,
              )
              const fileMeta = await db.query.files.findFirst({
                where: eq(schema.files.id, selectedFileId),
              })
              if (fileMeta?.embeddingStatus === "success") {
                setEmbeddingStatus("success")
              }
            }
          } catch (error) {
            console.error("Error processing file data during selection:", error)
            essayEmbeddingProcessedRef.current = null
          }
        } else {
          console.warn(`[Editor] Failed to load content for file ${selectedFileId}`)
          toast.error(`Failed to load content for file ${node.name}.`)
        }
      } catch (error) {
        console.error("Error handling file selection:", error)
        toast.error(`Could not load file ${node.name}. Please try again.`)
        notesDispatch({ type: "SET_CURRENT_FILE_ID", fileId: null })
        setCurrentFileHandle(null)
        setMarkdownContent("")
      }
    },
    [
      vault,
      currentVaultId,
      currentFileId,
      hasUnsavedChanges,
      handleSave,
      storeHandle,
      updateDbFile,
      loadFileContent,
      db,
      addTask,
      processEssayEmbeddings,
      notesDispatch,
    ],
  )

  const handleVisibleContextNotesChange = useCallback((noteIds: string[]) => {
    setVisibleContextNoteIds(noteIds)
  }, [])

  const onContentChange = useCallback(
    async (value: string) => {
      if (value !== contentRef.current.content) {
        setHasUnsavedChanges(true)
      }
      setMarkdownContent(value)
      updatePreview(value)
    },
    [updatePreview],
  )

  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        event.stopPropagation()
        toggleSettings()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        event.stopPropagation()
        handleSave()
        return
      }

      if (event.key === settings.toggleNotes && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleNotes()
      } else if (event.key === settings.toggleEditMode && (event.metaKey || event.altKey)) {
        event.preventDefault()
        setIsEditMode((prev) => !prev)
      }
    }
  }, [handleSave, toggleNotes, settings.toggleNotes, settings.toggleEditMode, toggleSettings])

  // Register vim commands separately to avoid type errors
  useEffect(() => {
    if (settings.vimMode) {
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
  }, [settings.vimMode, handleSave])

  useEffect(() => {
    const stableHandler = (e: KeyboardEvent) => {
      keyHandlerRef.current?.(e)
    }
    console.debug("Registering global keydown handler")
    window.addEventListener("keydown", stableHandler, { capture: true })
    return () => {
      console.debug("Removing global keydown handler")
      window.removeEventListener("keydown", stableHandler, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (codeMirrorViewRef.current) {
      console.debug("[Editor] Syncing CodeMirror vim mode setting:", settings.vimMode)
      const newState = EditorState.create({
        doc: codeMirrorViewRef.current.state.doc,
        selection: codeMirrorViewRef.current.state.selection,
        extensions: settings.vimMode ? [...baseExtensions, vim()] : baseExtensions,
      })
      codeMirrorViewRef.current.setState(newState)
    }
  }, [settings.vimMode, baseExtensions])

  const noteGroupsData = useMemo(() => {
    const currentGenerationNoteIds = new Set(currentGenerationNotes.map((note) => note.id))
    const droppedNoteIds = new Set(droppedNotes.map((note) => note.id))

    // Filter notes: exclude dropped, exclude current generation, and ensure it's not marked as dropped in its properties
    const filteredNotes = notes.filter(
      (note) =>
        !droppedNoteIds.has(note.id) &&
        !currentGenerationNoteIds.has(note.id) &&
        !note.dropped, // Explicitly check the note's dropped status
    )

    // Deduplicate based on ID *after* filtering
    const uniqueNotes = Array.from(new Map(filteredNotes.map((note) => [note.id, note])).values())

    return groupNotesByDate(uniqueNotes)
  }, [notes, droppedNotes, currentGenerationNotes])

  useEffect(() => {
    let newStatus: typeof embeddingStatus = null
    if (
      pendingTaskIds.length > 0 &&
      pendingTaskIds.some((taskId) => dbFile?.embeddingTaskId === taskId)
    ) {
      newStatus = "in_progress"
    } else if (dbFile?.embeddingStatus) {
      newStatus = dbFile.embeddingStatus as "in_progress" | "success" | "failure" | "cancelled"
    }
    if (newStatus !== embeddingStatus) {
      console.debug(
        `[Editor] Updating embedding status UI to: ${newStatus} for file ${currentFileId}`,
      )
      setEmbeddingStatus(newStatus)
    }
  }, [
    pendingTaskIds,
    dbFile?.embeddingStatus,
    dbFile?.embeddingTaskId,
    currentFileId,
    embeddingStatus,
  ])

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
                <AuthorProcessor db={db} />

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
                    onExpandStack={() => setIsStackExpanded((prev) => !prev)}
                    onDragBackToPanel={handleNoteDragBackToPanel}
                    className="before:mix-blend-multiply before:bg-noise-pattern"
                    visibleContextNoteIds={visibleContextNoteIds}
                  />
                  <div className="flex flex-col items-center space-y-2 absolute bottom-2 right-2 z-100">
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
                    <EmbeddingStatus status={embeddingStatus} />
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
                        basicSetup={memoizedBasicSetup}
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
                {showNotes && currentVaultId && (
                  <div className={cn("flex flex-col", showNotes ? "w-88 visible" : "w-0 hidden")}>
                    <NotesPanel
                      handleNoteDropped={handleNoteDropped}
                      handleNoteRemoved={handleNoteRemoved}
                      noteGroupsData={noteGroupsData}
                      droppedNotes={droppedNotes}
                      fileId={currentFileId}
                      vaultId={currentVaultId}
                      markdownContent={markdownContent}
                      currentFileHandle={currentFileHandle}
                      dbFile={dbFile}
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
