"use client"

import * as React from "react"
import { useEffect, useCallback, useState, useRef, useMemo, memo } from "react"
import axios, { AxiosResponse } from "axios"
import CodeMirror from "@uiw/react-codemirror"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { EditorView } from "@codemirror/view"
import { Compartment, EditorState } from "@codemirror/state"
import { Pencil, Eye } from "lucide-react"
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
import { useToast } from "@/hooks/use-toast"
import { SearchProvider } from "@/context/search-context"
import { SearchCommand } from "@/components/search-command"
import { jsPDF } from "jspdf"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import { NotesProvider } from "@/context/notes-context"
import { EditorNotes } from "@/components/editor-notes"
import { generatePastelColor } from "@/lib/notes"
import { notesService } from "@/services/notes-service"
import { db, type Note, type Vault, type FileSystemTreeNode } from "@/db"
import { createId } from "@paralleldrive/cuid2"

interface Suggestion {
  suggestion: string
  relevance: number
}

interface AsteraceaRequest {
  essay: string
  num_suggestions: number
  max_tokens: number
}

interface AsteraceaResponse {
  suggestions: Suggestion[]
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
  const { toast } = useToast()
  const [showNotes, setShowNotes] = useState(false)
  const toggleNotes = useCallback(() => setShowNotes((prev) => !prev), [])

  const [notes, setNotes] = useState<Note[]>([])

  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [notesError, setNotesError] = useState<string | null>(null)

  const vault = vaults.find((v) => v.id === vaultId)

  const contentRef = useRef({
    content: "",
    filename: "",
  })

  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    contentRef.current = {
      content: markdownContent,
      filename: currentFile,
    }
  }, [markdownContent, currentFile])

  useEffect(() => {
    if (currentFile && vault) {
      db.notes.where('fileId').equals(currentFile).toArray().then(loadedNotes => {
        setNotes(loadedNotes)
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

  const handleExportPdf = useCallback(() => {
    const { content, filename } = contentRef.current
    const pdf = new jsPDF({ unit: "pt", format: "a4" })

    const preview = document.querySelector(".prose") as HTMLElement
    const styles = preview ? getComputedStyle(preview) : null

    const fontSize = styles?.fontSize || "16px"
    const fontFamily = "Parclo Serif"

    const lines = pdf.splitTextToSize(md(content).content, 180)
    pdf.text(lines, 10, 10)

    pdf.setFont(fontFamily)
    pdf.setFontSize(parseFloat(fontSize))

    pdf.save(filename.endsWith(".md") ? filename.slice(0, -3) + ".pdf" : `${filename}.pdf`)
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
        toast({
          title: "Conversion failed",
          description: error instanceof Error ? error.message : "Failed to convert markdown",
        })
      }
    },
    [currentFile, toast, settings, vaultId],
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

  const fetchNewNotes = async (content: string): Promise<GeneratedNote[]> => {
    try {
      const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT
      if (!apiEndpoint) {
        throw new Error("Notes functionality is currently unavailable")
      }

      const resp = await axios.post<
        AsteraceaResponse,
        AxiosResponse<AsteraceaResponse>,
        AsteraceaRequest
      >(
        `${apiEndpoint}/suggests`,
        {
          essay: md(content).content,
          num_suggestions: 8,
          max_tokens: 8192,
        },
        {
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
          },
        },
      )

      setNotesError(null)
      return resp.data.suggestions.map((item, index) => ({
        title: `Note ${index + 1}`,
        content: item.suggestion,
      }))
    } catch (error) {
      setNotesError("Notes not available, try again later")
      throw error
    }
  }

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
          const newNotes: Note[] = generatedNotes.map(note => ({
            id: createId(),
            content: note.content,
            color: generatePastelColor(),
            fileId: currentFile,
            vaultId: vault!.id,
            isInEditor: false,
            createdAt: new Date(),
            lastModified: new Date()
          }))
          await Promise.all(newNotes.map(note => db.notes.add(note)))
          setNotes(prev => [...prev, ...newNotes])
        } catch (error) {
          toast({
            title: "Note generation failed",
            description: error instanceof Error ? error.message : "Please try again later",
            variant: "destructive",
          })
        }
      }
    } catch {}
  }, [
    currentFileHandle,
    markdownContent,
    currentFile,
    vault,
    refreshVault,
    vaultId,
    showNotes,
    toast,
  ])

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

  useEffect(() => {
    if (!showNotes) return

    setIsNotesLoading(true)

    const timerId = setTimeout(async () => {
      try {
        const generatedNotes = await fetchNewNotes(markdownContent)
        const newNotes: Note[] = generatedNotes.map(note => ({
          id: createId(),
          content: note.content,
          color: generatePastelColor(),
          fileId: currentFile,
          vaultId: vault!.id,
          isInEditor: false,
          createdAt: new Date(),
          lastModified: new Date()
        }))
        await Promise.all(newNotes.map(note => db.notes.add(note)))
        setNotes(prev => [...prev, ...newNotes])
      } catch (error) {
        toast({
          title: "Note generation failed",
          description: error instanceof Error ? error.message : "Please try again later",
        })
      } finally {
        setIsNotesLoading(false)
      }
    }, 1000)

    return () => {
      clearTimeout(timerId)
    }
  }, [showNotes, markdownContent, toast, currentFile, vault])

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
        // TODO: update MermaidViewer
        // We capture the error for rendering mermaid diagram
        try {
          await window.mermaid.run({ nodes })
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
      } catch (error) {
        toast({
          title: "Error opening file",
          description: error instanceof Error ? error.message : "Failed to open file",
        })
      }
    },
    [vault, codeMirrorViewRef, updatePreview, toast, setHasUnsavedChanges],
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
  }, [handleSave, toast, toggleNotes, settings, handleKeyDown])

  const handleNoteGeneration = useCallback(async () => {
    if (!showNotes || isGenerating || !currentFile || !vault) return
    
    setIsGenerating(true)
    try {
      const count = await db.notes.where('fileId').equals(currentFile).count()
      const shouldGenerate = count === 0 && markdownContent.length > 1000
      
      if (shouldGenerate) {
        const generatedNotes = await fetchNewNotes(markdownContent)
        const newNotes: Note[] = generatedNotes.map(note => ({
          id: createId(),
          content: note.content,
          color: generatePastelColor(),
          fileId: currentFile,
          vaultId: vault.id,
          isInEditor: false,
          createdAt: new Date(),
          lastModified: new Date()
        }))
        await Promise.all(newNotes.map(note => db.notes.add(note)))
        setNotes(prev => [...prev, ...newNotes])
      }
    } catch (error) {
      toast({
        title: "Note generation failed",
        description: error instanceof Error ? error.message : "Please try again later",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [showNotes, isGenerating, currentFile, vault, markdownContent, toast])

  return (
    <DndProvider backend={HTML5Backend}>
      <NotesProvider>
        <SearchProvider vault={vault!}>
          <SidebarProvider defaultOpen={true}>
            <Explorer
              vault={vault!}
              currentFile={currentFile}
              markdownContent={markdownContent}
              editorViewRef={codeMirrorViewRef}
              onFileSelect={onFileSelect}
              onNewFile={onNewFile}
              onContentUpdate={updatePreview}
              onExportMarkdown={handleExportMarkdown}
              onExportPdf={handleExportPdf}
            />
            <SidebarInset>
              <header className="inline-block h-10 border-b">
                <div className="h-full flex shrink-0 items-center justify-between mx-4">
                  <SidebarTrigger className="-ml-1" title="Open Explorer" />
                  <Toolbar toggleNotes={toggleNotes} />
                </div>
              </header>
              <section className="flex h-[calc(100vh-104px)] gap-10 m-4">
                <div className="flex-1 relative border">
                  <div
                    className={`editor-mode absolute inset-0 ${isEditMode ? "block" : "hidden"}`}
                  >
                    <div className="h-full scrollbar-hidden relative">
                      <div className="absolute top-4 left-4 text-sm/7 z-10 flex items-center gap-2">
                        {hasUnsavedChanges && <DotIcon className="text-yellow-200" />}
                      </div>
                      <EditorNotes />
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
                        className="overflow-auto h-full mx-12 pt-4 scrollbar-hidden"
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
                    <div className="prose dark:prose-invert h-full mx-4 pt-4 overflow-auto scrollbar-hidden">
                      <article className="@container h-full max-w-5xl mx-auto scrollbar-hidden">
                        {previewNode && toJsx(previewNode)}
                      </article>
                    </div>
                  </div>
                </div>
                {showNotes && (
                  <div
                    className="w-88 overflow-auto border scrollbar-hidden transition-[right,left,width] duration-200  ease-in-out translate-x-[-100%] data-[show=true]:translate-x-0"
                    data-show={showNotes}
                  >
                    <div className="p-4">
                      {notesError ? (
                        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                          {notesError}
                        </div>
                      ) : isNotesLoading ? (
                        <div className="grid gap-4">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className="w-full p-4 bg-card border border-border rounded"
                            >
                              <Skeleton className="h-4 w-1/2 mb-2" />
                              <Skeleton className="h-3 w-full mb-1" />
                              <Skeleton className="h-3 w-full mb-1" />
                              <Skeleton className="h-3 w-2/3" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-4">
                          {notes.map((note, index) => (
                            <NoteCard
                              key={index}
                              className="w-full"
                              note={{
                                id: `note-${index}`,
                                content: note.content,
                                color: generatePastelColor(),
                                fileId: currentFile,
                                isInEditor: false,
                                createdAt: new Date(),
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
              <footer className="inline-block h-8 border-t text-xs/8">
                <div
                  className="h-full flex shrink-0 items-center align-middle font-serif justify-end mx-4 gap-4 text-muted-foreground hover:text-accent-foreground cursor-pointer"
                  aria-hidden
                  tabIndex={-1}
                >
                  <span>{currentFile.replace(".md", "")}</span>
                  <span>{markdownContent.split(/\s+/).filter(Boolean).length} words</span>
                  <span>{markdownContent.length} chars</span>
                  {isEditMode ? (
                    <Eye className="h-3 w-3 p-0" widths={16} height={16} />
                  ) : (
                    <Pencil className="h-3 w-3 p-0" widths={16} height={16} />
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
