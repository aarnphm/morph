"use client"

import * as React from "react"
import { useEffect, useCallback, useState, useRef, useMemo, memo } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { EditorView } from "@codemirror/view"
import { Compartment, EditorState } from "@codemirror/state"
import { Pencil1Icon, EyeOpenIcon } from "@radix-ui/react-icons"
import usePersistedSettings from "@/hooks/use-persisted-settings"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Vim, vim } from "@replit/codemirror-vim"
import { NoteCard } from "@/components/note-card"
import Explorer from "@/components/explorer"
import { Toolbar } from "@/components/toolbar"
import { fileField, mdToHtml } from "@/components/markdown-inline"
import { toJsx } from "@/lib"
import type { Root } from "hast"
import { useTheme } from "next-themes"
import { useVaultContext } from "@/context/vault-context"
import { md, frontmatter, syntaxHighlighting, theme as editorTheme } from "@/components/parser"
import { setFile } from "@/components/markdown-inline"
import { DotIcon } from "@/components/ui/icons"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchProvider } from "@/context/search-context"
import { SearchCommand } from "@/components/search-command"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import { NotesProvider } from "@/context/notes-context"
import { EditorNotes } from "@/components/editor-notes"
import { generatePastelColor } from "@/lib/notes"
import { db, type Note, type Vault, type FileSystemTreeNode } from "@/db"
import { createId } from "@paralleldrive/cuid2"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { ReasoningPanel } from "@/components/reasoning-panel"

interface StreamingDelta {
  suggestion: string
  reasoning: string
}

interface Suggestions {
  suggestions: { suggestion: string }[]
}

interface EditorProps {
  vaultId: string
  vaults: Vault[]
}

interface GeneratedNote {
  title: string
  content: string
}

export default memo(function Editor({ vaultId, vaults }: EditorProps) {
  const { theme } = useTheme()
  // PERF: should not call it here, or figure out a way not to calculate the vault twice
  const { refreshVault, flattenedFileIds } = useVaultContext()
  const [currentFile, setCurrentFile] = useState<string>("Untitled")
  const [isEditMode, setIsEditMode] = useState(true)
  const [previewNode, setPreviewNode] = useState<Root | null>(null)
  const [isNotesLoading, setIsNotesLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [currentFileHandle, setCurrentFileHandle] = useState<FileSystemFileHandle | null>(null)

  const { settings } = usePersistedSettings()
  const codeMirrorViewRef = useRef<EditorView | null>(null)
  const readingModeRef = useRef<HTMLDivElement>(null)
  const [showNotes, setShowNotes] = useState(false)
  const toggleNotes = useCallback(() => {
    setShowNotes((prev) => {
      // Reset reasoning state when hiding notes panel
      if (prev) {
        setStreamingReasoning("")
        setReasoningComplete(false)
      }
      return !prev
    })
  }, [])

  const [notes, setNotes] = useState<Note[]>([])

  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [notesError, setNotesError] = useState<string | null>(null)
  const [droppedNotes, setDroppedNotes] = useState<Note[]>([])
  const [streamingReasoning, setStreamingReasoning] = useState<string>("")
  const [reasoningComplete, setReasoningComplete] = useState(false)
  const [pendingSuggestions, setPendingSuggestions] = useState<GeneratedNote[]>([])
  const [numSuggestions, setNumSuggestions] = useState(4) // Default number of suggestions
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false)
  const vault = vaults.find((v) => v.id === vaultId)

  const contentRef = useRef({
    content: "",
    filename: "",
  })

  // Mermaid reference for rendering diagrams
  const mermaidRef = useRef<any>(null)

  useEffect(() => {
    // Try to load mermaid dynamically if it's available in the window
    if (typeof window !== "undefined" && window.mermaid) {
      mermaidRef.current = window.mermaid
    }
  }, [])

  const handleNoteDropped = (note: Note) => {
    setDroppedNotes((prev) => {
      if (prev.find((n) => n.id === note.id)) return prev
      return [...prev, note]
    })
  }

  useEffect(() => {
    contentRef.current = {
      content: markdownContent,
      filename: currentFile,
    }
  }, [markdownContent, currentFile])

  useEffect(() => {
    if (currentFile && vault) {
      db.notes
        .where("fileId")
        .equals(currentFile)
        .toArray()
        .then((loadedNotes) => {
          // Sort notes from latest to oldest
          const sortedNotes = loadedNotes.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          setNotes(sortedNotes)
        })
    }
  }, [currentFile, vault])

  const handleExportMarkdown = useCallback(() => {
    const { content, filename } = contentRef.current
    const blob = new Blob([md(content).content], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  const updatePreview = useCallback(
    async (value: string) => {
      try {
        const tree = await mdToHtml({
          value,
          settings,
          vaultId,
          filename: currentFile,
          returnHast: true,
        })
        setPreviewNode(tree)
      } catch (error) {
        console.log(error)
      }
    },
    [currentFile, settings, vaultId],
  )

  const onContentChange = useCallback(
    async (value: string) => {
      setMarkdownContent(value)
      if (value !== markdownContent) {
        setHasUnsavedChanges(true)
      }

      const timeoutId = setTimeout(() => updatePreview(value), 100)

      return () => clearTimeout(timeoutId)
    },
    [updatePreview, markdownContent],
  )

  const fetchNewNotes = async (
    content: string,
    num_suggestions: number = 4,
  ): Promise<GeneratedNote[]> => {
    try {
      const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT
      if (!apiEndpoint) {
        throw new Error("Notes functionality is currently unavailable")
      }

      // Reset states
      setStreamingReasoning("")
      setReasoningComplete(false)
      setPendingSuggestions([])
      setNumSuggestions(num_suggestions)
      setIsGeneratingSuggestions(false)

      const essay = md(content).content
      const max_tokens = 8192

      // Create streaming request
      const response = await fetch(`${apiEndpoint}/suggests`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ essay, num_suggestions, max_tokens }),
      })

      if (!response.ok) throw new Error("Failed to fetch suggestions")
      if (!response.body) throw new Error("Response body is empty")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      // We'll collect all suggestion JSON data here
      let suggestionString = ""
      let inReasoningPhase = true

      // Process the stream
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })

        // Process each line
        for (const line of chunk.split("\n")) {
          if (!line.trim()) continue

          try {
            const delta: StreamingDelta = JSON.parse(line)

            // Handle reasoning phase
            if (delta.reasoning) {
              setStreamingReasoning((prev) => prev + delta.reasoning)
            }

            // Check for phase transition
            if (delta.reasoning === "" && delta.suggestion !== "") {
              // First time we see suggestion means reasoning is complete
              if (inReasoningPhase) {
                setReasoningComplete(true)
                setIsGeneratingSuggestions(true)
                inReasoningPhase = false
              }

              // Collect suggestion data
              suggestionString += delta.suggestion
            }
          } catch (e) {
            console.log(e)
          }
        }
      }

      // Ensure we mark reasoning as complete
      if (inReasoningPhase) {
        setReasoningComplete(true)
      }

      // Clean up
      reader.releaseLock()

      // Parse collected suggestions
      let generatedNotes: GeneratedNote[] = []

      if (suggestionString.trim()) {
        try {
          const suggestionData: Suggestions = JSON.parse(suggestionString.trim())

          if (suggestionData.suggestions && Array.isArray(suggestionData.suggestions)) {
            generatedNotes = suggestionData.suggestions.map((suggestion, index) => ({
              title: `suggestion ${index + 1}`,
              content: suggestion.suggestion,
            }))

            setPendingSuggestions(generatedNotes)
          }
        } catch (e) {
          console.error("Error parsing suggestions:", e)
        }
      }

      // Reset generation state
      setIsGeneratingSuggestions(false)

      // Default note if needed
      if (generatedNotes.length === 0) {
        generatedNotes = [
          {
            title: "Suggestion",
            content: "Could not generate suggestions",
          },
        ]
      }

      setNotesError(null)
      return generatedNotes
    } catch (error) {
      setNotesError("Notes not available, try again later")
      setReasoningComplete(true)
      setIsGeneratingSuggestions(false)
      throw error
    }
  }

  // Group notes by date for display
  const groupNotesByDate = useCallback((notesList: Note[]) => {
    const groups: { [key: string]: Note[] } = {}

    notesList.forEach((note) => {
      const date = new Date(note.createdAt)
      const dateKey = date.toDateString()

      if (!groups[dateKey]) {
        groups[dateKey] = []
      }

      groups[dateKey].push(note)
    })

    return Object.entries(groups)
  }, [])

  // Format date for display
  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let formattedDate

    if (date.toDateString() === today.toDateString()) {
      formattedDate = "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      formattedDate = "Yesterday"
    } else {
      // Format: Month Day, Year (if not current year)
      const options: Intl.DateTimeFormatOptions = {
        month: "long",
        day: "numeric",
      }

      // Add year if not current year
      if (date.getFullYear() !== today.getFullYear()) {
        options.year = "numeric"
      }

      formattedDate = date.toLocaleDateString(undefined, options)
    }

    return formattedDate
  }, [])

  const handleSave = useCallback(async () => {
    try {
      let targetHandle = currentFileHandle

      if (!targetHandle) {
        targetHandle = await window.showSaveFilePicker({
          id: vaultId,
          suggestedName: currentFile.endsWith(".md") ? currentFile : `${currentFile}.md`,
          types: [
            {
              description: "Markdown Files",
              accept: { "text/markdown": [".md"] },
            },
          ],
        })
      }

      const writable = await targetHandle.createWritable()
      await writable.write(markdownContent)
      await writable.close()

      if (!currentFileHandle && vault) {
        setCurrentFileHandle(targetHandle)
        setCurrentFile(targetHandle.name)

        await refreshVault(vault.id)
      }

      setHasUnsavedChanges(false)

      if (showNotes) {
        try {
          const generatedNotes = await fetchNewNotes(markdownContent)
          const newNotes: Note[] = generatedNotes.map((note) => ({
            id: createId(),
            content: note.content,
            color: generatePastelColor(),
            fileId: currentFile,
            vaultId: vault!.id,
            isInEditor: false,
            createdAt: new Date(),
            lastModified: new Date(),
          }))
          await Promise.all(newNotes.map((note) => db.notes.add(note)))
          // Add new notes and re-sort the combined array
          setNotes((prev) => {
            const combined = [...prev, ...newNotes]
            return combined.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )
          })
        } catch (error) {
          console.log(error)
        }
      }
    } catch {}
  }, [currentFileHandle, markdownContent, currentFile, vault, refreshVault, vaultId, showNotes])

  const memoizedExtensions = useMemo(() => {
    const tabSize = new Compartment()

    return [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      frontmatter(),
      EditorView.lineWrapping,
      tabSize.of(EditorState.tabSize.of(settings.tabSize)),
      fileField.init(() => currentFile),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          const newFilename = update.state.field(fileField)
          setCurrentFile(newFilename)
        }
      }),
      syntaxHighlighting(),
      vim(),
    ]
  }, [settings.tabSize, currentFile])

  useEffect(() => {
    if (markdownContent) {
      updatePreview(markdownContent)
      window.dispatchEvent(new CustomEvent("mermaid-content", { detail: true }))
    }
  }, [markdownContent, updatePreview])

  const onFileSelect = useCallback((handle: FileSystemFileHandle) => {
    setCurrentFileHandle(handle)
    setCurrentFile(handle.name)
  }, [])

  const onNewFile = useCallback(() => {
    setCurrentFileHandle(null)
    setCurrentFile("Untitled")
  }, [])

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      if (event.key === settings.notePanelShortcut && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleNotes()
      } else if (event.key === settings.editModeShortcut && (event.metaKey || event.altKey)) {
        event.preventDefault()
        setIsEditMode((prev) => !prev)
        const nodes = document.querySelectorAll<HTMLDivElement>("pre > code.mermaid")
        // Safely try to render mermaid diagrams if available
        try {
          if (mermaidRef.current) await mermaidRef.current.run({ nodes })
        } catch {}
      } else if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        handleSave()
      }
    },
    [handleSave, settings, toggleNotes],
  )

  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !codeMirrorViewRef.current) return

      try {
        const file = await node.handle.getFile()
        const content = await file.text()

        codeMirrorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: codeMirrorViewRef.current.state.doc.length,
            insert: content,
          },
          effects: setFile.of(file.name),
        })

        setCurrentFileHandle(node.handle as FileSystemFileHandle)
        setCurrentFile(file.name)
        setMarkdownContent(content)
        setHasUnsavedChanges(false)
        updatePreview(content)
      } catch {
        //TODO: do something with the error
      }
    },
    [vault, codeMirrorViewRef, updatePreview, setHasUnsavedChanges],
  )

  // Effect to update vim mode when settings change, with keybinds
  useEffect(() => {
    Vim.defineEx("w", "w", handleSave)
    Vim.defineEx("wa", "w", handleSave)
    Vim.map(";", ":", "normal")
    Vim.map("jj", "<Esc>", "insert")
    Vim.map("jk", "<Esc>", "insert")

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave, toggleNotes, settings, handleKeyDown])

  useEffect(() => {
    if (!showNotes) return

    setIsNotesLoading(true)

    const timerId = setTimeout(async () => {
      try {
        const generatedNotes = await fetchNewNotes(markdownContent)
        const newNotes: Note[] = generatedNotes.map((note) => ({
          id: createId(),
          content: note.content,
          color: generatePastelColor(),
          fileId: currentFile,
          vaultId: vault!.id,
          isInEditor: false,
          createdAt: new Date(),
          lastModified: new Date(),
        }))
        await Promise.all(newNotes.map((note) => db.notes.add(note)))
        setNotes((prev) => {
          const combined = [...prev, ...newNotes]
          return combined.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
        })
      } catch {
        // TODO: do something with the error, silent for now
      } finally {
        setIsNotesLoading(false)
      }
    }, 1000)

    return () => {
      clearTimeout(timerId)
    }
  }, [showNotes, currentFile, vault, markdownContent])

  // Generate skeletons based on num_suggestions
  const renderNotesSkeletons = () => {
    return Array.from({ length: numSuggestions }).map((_, i) => (
      <div key={i} className="w-full p-4 mb-4 bg-card border border-border rounded animate-pulse">
        <Skeleton className="h-4 w-1/2 mb-2" />
        <Skeleton className="h-3 w-full mb-1" />
        <Skeleton className="h-3 w-full mb-1" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    ))
  }

  // Render suggestions while they're being generated
  const renderPendingSuggestions = () => {
    return pendingSuggestions.map((note, index) => (
      <NoteCard
        key={`pending-${index}`}
        className="w-full"
        isGenerating={isGeneratingSuggestions}
        note={{
          id: `pending-${index}`,
          content: note.content,
          color: generatePastelColor(),
          fileId: currentFile,
          isInEditor: false,
          createdAt: new Date(),
        }}
      />
    ))
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <NotesProvider>
        <SearchProvider vault={vault!}>
          <SidebarProvider defaultOpen={true}>
            <Explorer
              vault={vault!}
              editorViewRef={codeMirrorViewRef}
              onFileSelect={onFileSelect}
              onNewFile={onNewFile}
              onContentUpdate={updatePreview}
              onExportMarkdown={handleExportMarkdown}
            />
            <SidebarInset className="flex flex-col h-screen overflow-hidden">
              <header className="sticky top-0 h-10 border-b bg-background z-10">
                <div className="h-full flex shrink-0 items-center justify-between mx-4">
                  <SidebarTrigger className="-ml-1" title="Open Explorer" />
                  <Toolbar toggleNotes={toggleNotes} />
                </div>
              </header>
              <section className="flex flex-1 overflow-hidden m-4 rounded-md border">
                <div className="flex-1 relative">
                  <EditorNotes />
                  <div
                    className={`editor-mode absolute inset-0 ${isEditMode ? "block" : "hidden"}`}
                  >
                    <div className="h-full scrollbar-hidden relative">
                      <div className="absolute top-4 left-4 text-sm/7 z-10 flex items-center gap-2">
                        {hasUnsavedChanges && <DotIcon className="text-yellow-200" />}
                      </div>
                      <CodeMirror
                        value={markdownContent}
                        height="100%"
                        autoFocus
                        placeholder={"What's on your mind?"}
                        basicSetup={{
                          rectangularSelection: true,
                          indentOnInput: true,
                          syntaxHighlighting: true,
                          searchKeymap: true,
                          highlightActiveLine: false,
                          highlightSelectionMatches: false,
                        }}
                        indentWithTab={false}
                        extensions={memoizedExtensions}
                        onChange={onContentChange}
                        className="overflow-auto h-full mx-8 pt-4 scrollbar-hidden"
                        theme={theme === "dark" ? "dark" : editorTheme}
                        onCreateEditor={(view) => {
                          codeMirrorViewRef.current = view
                        }}
                      />
                      {showNotes && droppedNotes.length > 0 && (
                        <div className="absolute top-0 right-0 flex flex-col items-center gap-2 mr-4 mt-4">
                          {droppedNotes.map((note, index) => (
                            <HoverCard key={note.id}>
                              <HoverCardTrigger asChild>
                                <div
                                  className={`relative w-10 h-10 rounded shadow cursor-pointer flex items-center justify-center ${note.color}`}
                                  onClick={() => {
                                    // TODO: Clicking -> embeddings search
                                    console.log(
                                      `Note ID: ${note.id}, Content: ${note.content}, Color: ${note.color}`,
                                    )
                                  }}
                                >
                                  <div className="relative z-10">{index + 1}</div>
                                </div>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80">
                                <p className="text-sm text-muted-foreground">{note.content}</p>
                              </HoverCardContent>
                            </HoverCard>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className={`reading-mode absolute inset-0 ${isEditMode ? "hidden" : "block overflow-hidden"}`}
                    ref={readingModeRef}
                  >
                    <div className="prose dark:prose-invert h-full mx-8 pt-4 overflow-auto scrollbar-hidden">
                      <article className="@container h-full max-w-5xl mx-auto scrollbar-hidden">
                        {previewNode && toJsx(previewNode)}
                      </article>
                    </div>
                  </div>
                </div>
                {showNotes && (
                  <div
                    className="w-88 flex flex-col border-l transition-[right,left,width] duration-200 ease-in-out translate-x-[-100%] data-[show=true]:translate-x-0"
                    data-show={showNotes}
                  >
                    {notesError ? (
                      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground p-4">
                        {notesError}
                      </div>
                    ) : (
                      <>
                        <div className="p-2 pb-0 bg-background border-b">
                          <ReasoningPanel
                            reasoning={streamingReasoning}
                            isStreaming={isNotesLoading && !reasoningComplete}
                            isComplete={reasoningComplete}
                          />
                        </div>

                        <div className="flex-1 overflow-auto scrollbar-hidden p-4 gap-4 mt-2">
                          {isNotesLoading &&
                            reasoningComplete &&
                            !pendingSuggestions.length &&
                            renderNotesSkeletons()}

                          {/* Show final notes once loading is complete */}
                          {!isNotesLoading && notes.length > 0 ? (
                            <div className="space-y-6">
                              {groupNotesByDate(notes).map(([dateStr, dateNotes]) => (
                                <div key={dateStr} className="space-y-4">
                                  <div className="bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground font-medium border-y border-border">
                                    {formatDate(dateStr)}
                                  </div>

                                  <div className="grid gap-4">
                                    {dateNotes.map((note, index) => (
                                      <div
                                        key={note.id}
                                        draggable={true}
                                        onDragEnd={(e) => {
                                          // Remove note from note panel when note dropped onto editor
                                          if (e.dataTransfer.dropEffect === "move") {
                                            setNotes((prev) => prev.filter((n) => n.id !== note.id))
                                            handleNoteDropped(note)
                                          }
                                        }}
                                      >
                                        <NoteCard
                                          className="w-full"
                                          note={{
                                            id: note.id,
                                            content: note.content,
                                            color: note.color ?? generatePastelColor(),
                                            fileId: currentFile,
                                            isInEditor: false,
                                            createdAt: note.createdAt ?? new Date(),
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            !isNotesLoading && (
                              <div className="text-center text-muted-foreground text-sm mt-4">
                                No notes generated yet
                              </div>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
              <footer className="sticky bottom-0 h-8 border-t text-xs/8 bg-background z-10">
                <div
                  className="h-full flex shrink-0 items-center align-middle font-serif justify-end mx-4 gap-4 text-muted-foreground hover:text-accent-foreground cursor-pointer"
                  aria-hidden
                  tabIndex={-1}
                >
                  <span>{currentFile.replace(".md", "")}</span>
                  <span>{markdownContent.split(/\s+/).filter(Boolean).length} words</span>
                  <span>{markdownContent.length} chars</span>
                  {isEditMode ? (
                    <EyeOpenIcon className="h-3 w-3 p-0" widths={16} height={16} />
                  ) : (
                    <Pencil1Icon className="h-3 w-3 p-0" widths={16} height={16} />
                  )}
                </div>
              </footer>
              <SearchCommand
                maps={flattenedFileIds}
                vault={vault!}
                onFileSelect={handleFileSelect}
              />
            </SidebarInset>
          </SidebarProvider>
        </SearchProvider>
      </NotesProvider>
    </DndProvider>
  )
})
