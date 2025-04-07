"use client"

import { cn } from "@/lib/utils"
import { EditorView } from "@codemirror/view"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Cross2Icon,
  CrumpledPaperIcon,
  GearIcon,
  KeyboardIcon,
  LayoutIcon,
  PinLeftIcon,
  PinRightIcon,
  PlusIcon,
} from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { setFile } from "@/components/markdown-inline"
import { VaultButton } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar"
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSub } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import usePersistedSettings from "@/hooks/use-persisted-settings"

import { FileSystemTreeNode, Vault } from "@/db/interfaces"

interface FileTreeNodeProps {
  node: FileSystemTreeNode
  onFileSelect?: (node: FileSystemTreeNode) => void
  isExpanded?: boolean
}

const FileTreeContext = React.createContext<{
  onFileSelect: (node: FileSystemTreeNode) => void
  isExpanded: boolean
}>({
  onFileSelect: () => {},
  isExpanded: false,
})

// Create a properly typed context for expanded folder paths to maintain cache state
const ExpandedFoldersContext = React.createContext<{
  expandedFolders: Set<string>
  setExpandedFolder: (path: string, isExpanded: boolean) => void
}>({
  expandedFolders: new Set<string>(),
  setExpandedFolder: () => {},
})

// Add this to prevent excessive re-renders from folder expansion state changes
const useExpandedFoldersState = () => {
  // Using useRef for storing expanded folders to avoid unnecessary re-renders
  const expandedFoldersRef = React.useRef(new Set<string>())
  // Keep a state copy to trigger re-renders only when needed
  const [, setExpandedFolders] = useState<Set<string>>(new Set())

  // Batch updates for better performance when many folders are expanded/collapsed
  const [pendingUpdates, setPendingUpdates] = useState<
    Array<{ path: string; isExpanded: boolean }>
  >([])

  // Update function that batches changes
  const setExpandedFolder = useCallback((path: string, isExpanded: boolean) => {
    setPendingUpdates((prev) => [...prev, { path, isExpanded }])
  }, [])

  // Process batched updates with throttling
  useEffect(() => {
    if (pendingUpdates.length === 0) return

    const timer = setTimeout(() => {
      // Apply all pending updates at once
      const newSet = new Set(expandedFoldersRef.current)
      pendingUpdates.forEach(({ path, isExpanded }) => {
        if (isExpanded) {
          newSet.add(path)
        } else {
          newSet.delete(path)
        }
      })

      // Update the ref immediately
      expandedFoldersRef.current = newSet
      // Update state to trigger re-renders
      setExpandedFolders(newSet)
      // Clear pending updates
      setPendingUpdates([])
    }, 50) // Throttle updates

    return () => clearTimeout(timer)
  }, [pendingUpdates])

  return {
    expandedFolders: expandedFoldersRef.current,
    setExpandedFolder,
  }
}

// Create a component for the extension pill
const ExtensionPill = memo(function ExtensionPill({ extension }: { extension: string }) {
  // Generate a consistent but unique color for each extension type
  const getExtensionColor = (ext: string) => {
    const colors: Record<string, string> = {
      js: "bg-yellow-100 text-yellow-800",
      ts: "bg-blue-100 text-blue-800",
      tsx: "bg-blue-200 text-blue-900",
      jsx: "bg-yellow-200 text-yellow-900",
      css: "bg-purple-100 text-purple-800",
      scss: "bg-pink-100 text-pink-800",
      html: "bg-orange-100 text-orange-800",
      json: "bg-gray-100 text-gray-800",
      md: "bg-green-100 text-green-800",
      py: "bg-cyan-100 text-cyan-800",
      rb: "bg-red-100 text-red-800",
      java: "bg-amber-100 text-amber-800",
      go: "bg-sky-100 text-sky-800",
      rs: "bg-orange-100 text-orange-800",
      c: "bg-slate-100 text-slate-800",
      cpp: "bg-slate-100 text-slate-800",
      php: "bg-indigo-100 text-indigo-800",
    }

    return colors[ext] || "bg-gray-100 text-gray-800"
  }

  return (
    <span
      className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[0.65rem] font-medium inline-flex items-center justify-center ${getExtensionColor(extension)}`}
    >
      {extension}
    </span>
  )
})

// Create a simplified version of the FileTreeNode component that uses path-based caching
export const FileTreeNode = memo(
  function FileTreeNode({
    node,
    nodePath = "",
  }: Omit<FileTreeNodeProps, "onFileSelect" | "isExpanded"> & { nodePath?: string }) {
    const { onFileSelect, isExpanded } = React.useContext(FileTreeContext)
    const { expandedFolders, setExpandedFolder } = React.useContext(ExpandedFoldersContext)

    // Generate a unique path for this node
    const currentPath = nodePath ? `${nodePath}/${node.name}` : node.name

    // Check if this folder is expanded from the cache
    const isOpen = node.kind === "directory" ? expandedFolders.has(currentPath) : false

    // Track if children have been loaded
    const [childrenLoaded, setChildrenLoaded] = useState(false)

    // Lazily load children when folder is opened
    useEffect(() => {
      if (isOpen && !childrenLoaded && node.children) {
        const timer = setTimeout(() => {
          setChildrenLoaded(true)
        }, 50)
        return () => clearTimeout(timer)
      }
    }, [isOpen, childrenLoaded, node.children])

    const toggleOpen = useCallback(() => {
      if (node.kind === "directory") {
        setExpandedFolder(currentPath, !isOpen)
      }
    }, [node, currentPath, isOpen, setExpandedFolder])

    const handleFileClick = useCallback(() => {
      onFileSelect?.(node)
    }, [onFileSelect, node])

    // Add a handler for opening unsupported files with the system's default app
    const handleOpenWithSystemDefault = useCallback(async () => {
      if (node.kind !== "file" || !node.handle) return

      try {
        // Get the file
        const file = await node.handle.getFile()

        // Create a blob URL for the file
        const fileUrl = URL.createObjectURL(file)

        // Open the file in a new tab/window
        window.open(fileUrl, "_blank")

        // Clean up the blob URL after a short delay
        setTimeout(() => {
          URL.revokeObjectURL(fileUrl)
        }, 1000)
      } catch (error) {
        console.error("Error opening file:", error)
        toast.error("Could not open the file with the system's default application")
      }
    }, [node])

    const MemoizedSidebarFolderItem = useMemo(
      () => (
        <SidebarMenuItem>
          <CollapsibleTrigger asChild className="cursor-pointer">
            <SidebarMenuButton onClick={toggleOpen} className="w-full text-xs">
              {isOpen ? (
                <ChevronDownIcon className="transition-transform w-3.5 h-3.5 mr-1 shrink-0" />
              ) : (
                <ChevronRightIcon className="transition-transform w-3.5 h-3.5 mr-1 shrink-0" />
              )}
              <span className={isExpanded ? "!whitespace-normal !break-words" : "truncate"}>
                {node.name}
              </span>
              {node.children && node.children.length > 30 && (
                <span className="ml-1 text-muted-foreground text-xs">{node.children.length}</span>
              )}
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {isOpen && childrenLoaded && node.children && (
              <SidebarMenuSub className="mr-0 pl-3">
                {node.children.map((child, index) => (
                  <FileTreeNode
                    key={`${child.name}.${child.extension ?? ""}-${index}`}
                    node={child}
                    nodePath={currentPath}
                  />
                ))}
              </SidebarMenuSub>
            )}
          </CollapsibleContent>
        </SidebarMenuItem>
      ),
      [isOpen, toggleOpen, node, isExpanded, childrenLoaded, currentPath],
    )

    // Create separate memo components for supported and non-supported files
    const MemoizedSupportedFileItem = useMemo(
      () => (
        <SidebarMenuButton
          className="data-[active=true]:bg-transparent hover:bg-accent/50 transition-colors flex items-center cursor-pointer w-full text-xs py-1"
          onClick={handleFileClick}
        >
          <span
            className={cn(
              "flex-1 max-w-full",
              isExpanded ? "!whitespace-normal !break-words" : "truncate",
            )}
          >
            {node.name}
          </span>
          {node.extension && node.extension !== "md" && (
            <ExtensionPill extension={node.extension} />
          )}
        </SidebarMenuButton>
      ),
      [handleFileClick, node, isExpanded],
    )

    const MemoizedUnsupportedFileItem = useMemo(
      () => (
        <div
          className="flex items-center w-full text-xs py-1 px-3 opacity-60 hover:bg-accent/30 transition-colors cursor-pointer"
          onClick={handleOpenWithSystemDefault}
          title={`Open ${node.name} with system default application`}
        >
          <span className={cn(isExpanded ? "!whitespace-normal !break-words" : "truncate")}>
            {node.name}
          </span>
          {node.extension && <ExtensionPill extension={node.extension} />}
        </div>
      ),
      [node, isExpanded, handleOpenWithSystemDefault],
    )

    // Show all files, but only make .md files clickable
    if (node.kind === "file") {
      if (node.extension !== "md") {
        // For non-markdown files, render them with hover effect but no click functionality
        return MemoizedUnsupportedFileItem
      }
      return MemoizedSupportedFileItem
    }

    return (
      <Collapsible open={isOpen} onOpenChange={toggleOpen} className="group/collapsible" asChild>
        {MemoizedSidebarFolderItem}
      </Collapsible>
    )
  },
  (prevProps, nextProps) => {
    // We only need to compare the node and path now
    return prevProps.node === nextProps.node && prevProps.nodePath === nextProps.nodePath
  },
)

// Create a more optimized FileTreeItem component for individual rendering
const FileTreeItem = memo(
  function FileTreeItem({ node, nodePath = "" }: { node: FileSystemTreeNode; nodePath?: string }) {
    return <FileTreeNode node={node} nodePath={nodePath} />
  },
  (prevProps, nextProps) => {
    // Simple reference equality for the node is sufficient here
    return prevProps.node === nextProps.node && prevProps.nodePath === nextProps.nodePath
  },
)

// Implement a basic virtualization helper for rendering large file trees
function useVirtualizedItems<T>(items: T[] = [], itemHeight: number = 24, overscan: number = 10) {
  const [visibleItems, setVisibleItems] = useState<T[]>([])
  const [startIndex, setStartIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalHeight = items.length * itemHeight

  const updateVisibleItems = useCallback(() => {
    if (!containerRef.current) return

    const { height } = containerRef.current.getBoundingClientRect()
    const scrollTop = containerRef.current.scrollTop

    const visibleStart = Math.floor(scrollTop / itemHeight)
    const visibleEnd = Math.min(items.length - 1, Math.floor((scrollTop + height) / itemHeight))

    // Add overscan
    const start = Math.max(0, visibleStart - overscan)
    const end = Math.min(items.length - 1, visibleEnd + overscan)

    setStartIndex(start)
    setVisibleItems(items.slice(start, end + 1))
  }, [items, itemHeight, overscan])

  useEffect(() => {
    updateVisibleItems()
  }, [items, updateVisibleItems])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener("scroll", updateVisibleItems)
    window.addEventListener("resize", updateVisibleItems)

    return () => {
      container.removeEventListener("scroll", updateVisibleItems)
      window.removeEventListener("resize", updateVisibleItems)
    }
  }, [updateVisibleItems])

  return {
    containerRef,
    visibleItems,
    startIndex,
    totalHeight,
    paddingTop: startIndex * itemHeight,
  }
}

// Update the FileTree component to use virtualization for large node arrays
const FileTree = memo(
  function FileTree({
    nodes,
    onFileSelect,
    isExpanded,
  }: {
    nodes: FileSystemTreeNode[]
    onFileSelect: (node: FileSystemTreeNode) => void
    isExpanded: boolean
  }) {
    // Use our optimized expanded folders state hook
    const expandedFoldersState = useExpandedFoldersState()

    // Use virtualization for large directories (>100 items)
    const useVirtual = nodes.length > 100
    const itemHeight = 24 // Approximate height of each file node
    const { containerRef, visibleItems, startIndex, totalHeight, paddingTop } = useVirtualizedItems(
      useVirtual ? nodes : [],
      itemHeight,
      10,
    )

    // Memoize the context value to avoid unnecessary re-renders of all children
    const fileTreeContextValue = useMemo(
      () => ({
        onFileSelect,
        isExpanded,
      }),
      [onFileSelect, isExpanded],
    )

    // Use the optimized expanded folders context
    const expandedFoldersContextValue = useMemo(
      () => ({
        expandedFolders: expandedFoldersState.expandedFolders,
        setExpandedFolder: expandedFoldersState.setExpandedFolder,
      }),
      [expandedFoldersState],
    )

    // Guard against empty or missing nodes array
    if (!nodes || nodes.length === 0) {
      return <div className="text-xs text-muted-foreground p-2">No files found</div>
    }

    return (
      <ExpandedFoldersContext.Provider value={expandedFoldersContextValue}>
        <FileTreeContext.Provider value={fileTreeContextValue}>
          <SidebarMenu>
            {useVirtual ? (
              <div
                ref={containerRef}
                className="overflow-y-auto h-full relative"
                style={{ height: "100%" }}
              >
                <div style={{ height: totalHeight + "px", position: "relative" }}>
                  <div style={{ transform: `translateY(${paddingTop}px)` }}>
                    {visibleItems.map((node, idx) => (
                      <FileTreeItem key={`${startIndex + idx}-${node.name}`} node={node} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {nodes.map((node, idx) => (
                  <FileTreeItem key={idx} node={node} />
                ))}
              </>
            )}
          </SidebarMenu>
        </FileTreeContext.Provider>
      </ExpandedFoldersContext.Provider>
    )
  },
  (prevProps, nextProps) => {
    // Use shallow comparison for nodes array
    if (prevProps.nodes !== nextProps.nodes) {
      // If nodes array reference changed, check if length changed as a quick test
      if (prevProps.nodes?.length !== nextProps.nodes?.length) {
        return false
      }
    }

    return (
      prevProps.onFileSelect === nextProps.onFileSelect &&
      prevProps.isExpanded === nextProps.isExpanded
    )
  },
)

interface RailsProps extends React.ComponentProps<typeof Sidebar> {
  vault: Vault
  editorViewRef: React.RefObject<EditorView | null>
  onFileSelect?: (node: FileSystemTreeNode) => void
  onNewFile?: () => void
  onContentUpdate?: (content: string) => void
  setIsSettingsOpen?: () => void
}

// Create a separate component for keyboard shortcuts
const KeyboardShortcutsSection = memo(function KeyboardShortcutsSection({
  isExpanded,
  settings,
  setIsSettingsOpen,
}: {
  isExpanded: boolean
  settings: any
  setIsSettingsOpen?: () => void
}) {
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)

  // Helper to display the correct modifier key based on platform
  const modifierKey = useMemo(() => {
    if (typeof navigator !== "undefined") {
      return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform) ? "⌘" : "Ctrl"
    }
    return "⌘/Ctrl"
  }, [])

  const toggleKeyboardShortcuts = useCallback(() => {
    // Only allow toggling when the sidebar is expanded
    if (isExpanded) {
      setShowKeyboardShortcuts((prev) => !prev)
    }
    // No else case needed - we'll handle expansion elsewhere
  }, [isExpanded])

  const toggleSettings = useCallback(() => {
    if (setIsSettingsOpen) {
      setIsSettingsOpen()
    }
  }, [setIsSettingsOpen])

  // Close keyboard shortcuts panel when sidebar is collapsed
  useEffect(() => {
    if (!isExpanded && showKeyboardShortcuts) {
      setShowKeyboardShortcuts(false)
    }
  }, [isExpanded, showKeyboardShortcuts])

  const keyboardShortcutsPanel = useMemo(() => {
    if (!showKeyboardShortcuts) return null

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "absolute w-52 bg-background rounded-lg border border-border p-4 shadow-lg z-50",
          isExpanded ? "right-4 bottom-12" : "left-12 bottom-0",
        )}
      >
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
          <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={toggleKeyboardShortcuts}
            className="flex items-center justify-center h-5 w-5"
          >
            <Cross2Icon className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span>
              {modifierKey} + {settings.toggleNotes}
            </span>
            <span className="text-muted-foreground">Toggle notes</span>
          </div>
          <div className="flex justify-between items-center">
            <span>
              {modifierKey} + {settings.toggleEditMode}
            </span>
            <span className="text-muted-foreground">Toggle preview</span>
          </div>
          <div className="flex justify-between items-center">
            <span>{modifierKey} + s</span>
            <span className="text-muted-foreground">Save</span>
          </div>
          <div className="flex justify-between items-center">
            <span>{modifierKey} + k</span>
            <span className="text-muted-foreground">Search</span>
          </div>
          <div className="flex justify-between items-center">
            <span>{modifierKey} + b</span>
            <span className="text-muted-foreground">Sidebar</span>
          </div>
          <div className="flex justify-between items-center">
            <span>{modifierKey} + ,</span>
            <span className="text-muted-foreground">Settings</span>
          </div>
        </div>
      </motion.div>
    )
  }, [showKeyboardShortcuts, isExpanded, toggleKeyboardShortcuts, modifierKey, settings])

  const keyboardButton = useMemo(
    () => (
      <div className="relative group mb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <VaultButton
              color="none"
              className={cn(
                "group w-full text-sm rounded-lg transition ease-in-out active:!scale-100 whitespace-nowrap",
                "flex !justify-start !min-w-0 px-4 py-2 h-9",
                "hover:bg-purple-100/20 active:!bg-purple-200/30",
              )}
              onClick={toggleKeyboardShortcuts}
              title="Keyboard Shortcuts"
            >
              <div className="-mx-2 flex flex-row items-center gap-3 text-purple-600">
                <div className="size-4 flex items-center justify-center">
                  <div className="p-1.5 group-active:!scale-[0.98] group-active:!shadow-none group-hover:-rotate-2 group-active:rotate-3 rounded-full transition-all ease-in-out bg-purple-100 group-hover:shadow-md">
                    <KeyboardIcon className="h-3 w-3 shrink-0" />
                  </div>
                </div>
                <motion.span
                  className="text-sm whitespace-nowrap mask-image-text overflow-hidden"
                  initial={false}
                  animate={{
                    opacity: isExpanded ? 1 : 0,
                  }}
                  transition={{
                    opacity: { duration: 0.15 },
                  }}
                >
                  Keyboard
                </motion.span>
              </div>
            </VaultButton>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={isExpanded}>
            Keyboard Shortcuts
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    [isExpanded, toggleKeyboardShortcuts],
  )

  const settingsButton = useMemo(
    () => (
      <div className="relative group mb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <VaultButton
              color="none"
              className={cn(
                "group w-full text-sm rounded-lg transition ease-in-out active:!scale-100 whitespace-nowrap",
                "flex !justify-start !min-w-0 px-4 py-2 h-9",
                "hover:bg-cyan-100/20 active:!bg-cyan-200/30",
              )}
              onClick={toggleSettings}
              title="Settings"
            >
              <div className="-mx-2 flex flex-row items-center gap-3 text-cyan-600">
                <div className="size-4 flex items-center justify-center">
                  <div className="p-1.5 group-active:!scale-[0.98] group-active:!shadow-none group-hover:-rotate-2 group-active:rotate-3 rounded-full transition-all ease-in-out bg-cyan-100 group-hover:shadow-md">
                    <GearIcon className="h-3 w-3 shrink-0" />
                  </div>
                </div>
                <motion.span
                  className="text-sm whitespace-nowrap mask-image-text overflow-hidden"
                  initial={false}
                  animate={{
                    opacity: isExpanded ? 1 : 0,
                  }}
                  transition={{
                    opacity: { duration: 0.15 },
                  }}
                >
                  Settings
                </motion.span>
              </div>
            </VaultButton>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={isExpanded}>
            Settings
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    [isExpanded, toggleSettings],
  )

  return (
    <div className="mt-auto w-full px-2 relative">
      <AnimatePresence initial={false}>
        {showKeyboardShortcuts && keyboardShortcutsPanel}
      </AnimatePresence>
      {keyboardButton}
      {settingsButton}
    </div>
  )
})

// Optimize animations cleanup on unmount
function useVisibilityBasedAnimation() {
  // Tracks if the component is visible in the viewport
  const [isVisible, setIsVisible] = useState(true)
  // Respect user preferences for reduced motion
  const prefersReducedMotion = useReducedMotion()
  // Track if component is mounted
  const isMounted = useRef(true)
  // Add a ref to track initial render
  const isInitialRender = useRef(true)

  // Skip animations when not visible, user prefers reduced motion, when unmounting, or on initial render
  const shouldAnimate =
    isVisible && !prefersReducedMotion && isMounted.current && !isInitialRender.current

  useEffect(() => {
    // Skip initial animation
    const timer = setTimeout(() => {
      isInitialRender.current = false
    }, 500) // Give a small delay to ensure everything has rendered

    // Simple intersection observer to detect visibility
    const observer = new IntersectionObserver(
      (entries) => {
        if (isMounted.current) {
          setIsVisible(entries[0]?.isIntersecting ?? true)
        }
      },
      { threshold: 0.1 },
    )

    // Use a ref to the parent element instead of tracking every animated element
    const parent = document.querySelector("nav")
    if (parent) observer.observe(parent)

    return () => {
      isMounted.current = false
      if (parent) observer.unobserve(parent)
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [])

  return shouldAnimate
}

export default memo(function Rails({
  className,
  vault,
  editorViewRef,
  onFileSelect,
  onNewFile,
  onContentUpdate,
  setIsSettingsOpen,
}: RailsProps) {
  const { toggleSidebar, state } = useSidebar()
  const isExpanded = state === "expanded"
  const router = useRouter()
  const { settings } = usePersistedSettings()
  // Use our custom hook to optimize animations
  const shouldAnimate = useVisibilityBasedAnimation()

  const onManageVault = useCallback(() => {
    setTimeout(() => {
      router.push("/vaults")
    }, 100)
  }, [router])

  const onNewFileClick = useCallback(() => {
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: "",
        },
        effects: setFile.of("Untitled"),
      })
    }
    onNewFile?.()
  }, [editorViewRef, onNewFile])

  const handleIconClick = useCallback(
    (id: string) => {
      switch (id) {
        case "new":
          onNewFileClick()
          break
        case "home":
          onManageVault()
          break
        default:
          break
      }
    },
    [onNewFileClick, onManageVault],
  )

  // Create a stable version of handleFileSelect that doesn't depend on dynamic props
  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!node || node.kind !== "file" || node.extension !== "md") {
        if (node && node.kind === "file" && node.extension !== "md") {
          toast.warning("Can only open markdown files")
        }
        return
      }

      try {
        // Use function refs to access the latest values without creating dependencies
        const currentVault = vault
        const currentEditorViewRef = editorViewRef
        const currentOnFileSelect = onFileSelect
        const currentOnContentUpdate = onContentUpdate

        if (!currentVault || !currentEditorViewRef.current) return

        const file = await node.handle!.getFile()
        const content = await file.text()

        if (currentOnFileSelect) currentOnFileSelect(node)

        currentEditorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentEditorViewRef.current.state.doc.length,
            insert: content,
          },
          effects: setFile.of(file.name),
        })

        if (currentOnContentUpdate) {
          currentOnContentUpdate(content)
        }
      } catch (error) {
        console.error("Error reading file:", error)
      }
    },
    [vault, editorViewRef, onContentUpdate, onFileSelect],
  )

  // Memoize the motion components to prevent unnecessary recalculations
  const sidebarMotionProps = useMemo(
    () => ({
      animate: {
        width: isExpanded ? "16rem" : "3.05rem",
      },
      transition: {
        duration: 0,
        type: "tween",
        ease: "easeOut",
        layoutDependency: false,
        willChange: "width",
      },
    }),
    [isExpanded],
  )

  // Memoize the vault icons buttons to prevent re-renders when toggling keyboard shortcuts
  const newFileButton = useMemo(
    () => (
      <div className="relative group">
        <Tooltip>
          <TooltipTrigger asChild>
            <VaultButton
              onClick={() => handleIconClick("new")}
              color="none"
              className={cn(
                "group w-full text-sm rounded-lg transition ease-in-out active:!scale-100 whitespace-nowrap",
                "flex !justify-start !min-w-0 px-4 py-2 h-9",
                "hover:bg-orange-100/20 active:!bg-orange-200/30",
              )}
              title="New file"
            >
              <div className="-mx-2 flex flex-row items-center gap-3 text-orange-600">
                <div className="size-4 flex items-center justify-center">
                  <div className="p-1.5 group-active:!scale-[0.98] group-active:!shadow-none group-hover:-rotate-2 group-active:rotate-3 rounded-full transition-all ease-in-out bg-orange-100 group-hover:shadow-md">
                    <PlusIcon className="h-3 w-3 shrink-0 transition-transform duration-300 ease-out group-hover:rotate-90" />
                  </div>
                </div>
                <motion.span
                  className="text-sm whitespace-nowrap mask-image-text overflow-hidden"
                  initial={false}
                  animate={{
                    opacity: isExpanded ? 1 : 0,
                  }}
                  transition={{
                    opacity: { duration: 0.15 },
                  }}
                >
                  New
                </motion.span>
              </div>
            </VaultButton>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={isExpanded}>
            Create new file
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    [isExpanded, handleIconClick],
  )

  const homeButton = useMemo(
    () => (
      <div className="relative group">
        <Tooltip>
          <TooltipTrigger asChild>
            <VaultButton
              onClick={() => handleIconClick("home")}
              color="none"
              className={cn(
                "group w-full text-sm rounded-lg transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)]",
                "hover:bg-gray-100/60 overflow-hidden !min-w-0 active:bg-gray-200/70 active:scale-[0.99] px-4 py-2 h-9",
                "text-gray-700 hover:text-gray-900",
              )}
              title="Home"
            >
              <div className="-translate-x-2 w-full flex flex-row items-center justify-start gap-3">
                <div className="size-4 flex items-center justify-center group-hover:!text-gray-900 text-gray-700">
                  <CrumpledPaperIcon className="h-4 w-4 shrink-0 group-hover:-translate-y-[0.5px] transition group-active:translate-y-0" />
                </div>
                <motion.span
                  className="text-sm whitespace-nowrap mask-image-text overflow-hidden"
                  initial={false}
                  animate={{
                    opacity: isExpanded ? 1 : 0,
                  }}
                  transition={{
                    opacity: { duration: 0.15 },
                  }}
                >
                  Home
                </motion.span>
              </div>
            </VaultButton>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={isExpanded}>
            Home
          </TooltipContent>
        </Tooltip>
      </div>
    ),
    [isExpanded, handleIconClick],
  )

  // Now update the fileTreeSection in the Rails component
  const fileTreeSection = useMemo(
    () => (
      <AnimatePresence mode="wait" initial={false}>
        {isExpanded && (
          <motion.div
            initial={shouldAnimate ? { opacity: 0, height: 0, overflow: "hidden" } : false}
            animate={
              shouldAnimate
                ? { opacity: 1, height: "auto", overflow: "visible" }
                : { opacity: 1, height: "auto", overflow: "visible" }
            }
            exit={
              shouldAnimate
                ? { opacity: 0, height: 0, overflow: "hidden" }
                : { opacity: 0, height: 0, overflow: "hidden" }
            }
            transition={{
              type: "tween",
              duration: shouldAnimate ? 0.2 : 0.01,
              ease: "easeOut",
              layoutDependency: false,
              willChange: "opacity, height",
            }}
            className="flex flex-grow flex-col relative px-2 mb-2 will-change-transform"
          >
            <h3 className="text-text-300 flex items-center gap-1.5 text-xs text-muted-foreground select-none pb-2 pl-2 sticky top-0 z-10 bg-bg-200 backdrop-blur-sm">
              Files
            </h3>
            <SidebarContent className="w-full p-0 overflow-hidden">
              <SidebarGroup className="p-0">
                <SidebarGroupContent className="h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                  <div className="relative">
                    <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-bg-200 to-transparent pointer-events-none z-10" />
                    {vault?.tree?.children && (
                      <FileTree
                        nodes={vault.tree.children}
                        onFileSelect={handleFileSelect}
                        isExpanded={isExpanded}
                      />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-bg-200 to-transparent pointer-events-none z-10" />
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </motion.div>
        )}
      </AnimatePresence>
    ),
    [isExpanded, vault?.tree?.children, handleFileSelect, shouldAnimate],
  )

  // TODO: Add settings panel back
  return (
    <motion.div
      className={cn("fixed z-sidebar lg:sticky h-full will-change-transform", className)}
      {...sidebarMotionProps}
      // Disable layout animations to improve performance
      layout={false}
    >
      <motion.nav
        className={cn(
          "h-screen flex flex-col items-center py-4 gap-3 fixed top-0 left-0 z-20 border-border border-r",
          "shadow-xl !bg-bg-300 backdrop-blur-sm will-change-transform",
        )}
        {...sidebarMotionProps}
        // Disable layout animations to improve performance
        layout={false}
      >
        <div className="flex w-full items-center gap-px px-2">
          <VaultButton
            onClick={toggleSidebar}
            color="none"
            className={cn(
              "transition-transform relative group",
              "text-gray-700 hover:bg-gray-100/60",
            )}
            title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            <AnimatePresence mode="wait">
              {isExpanded ? (
                <motion.div key="expanded" className="relative">
                  <PinLeftIcon className="h-4 w-4 absolute opacity-0 group-hover:opacity-100 transition-opacity" />
                  <LayoutIcon className="h-4 w-4 group-hover:opacity-0 transition-opacity" />
                </motion.div>
              ) : (
                <motion.div key="collapsed" className="relative">
                  <PinRightIcon className="h-4 w-4 absolute opacity-0 group-hover:opacity-100 transition-opacity" />
                  <LayoutIcon className="h-4 w-4 group-hover:opacity-0 transition-opacity" />
                </motion.div>
              )}
            </AnimatePresence>
          </VaultButton>
        </div>
        <div className="flex flex-col align-center h-full w-full overflow-hidden">
          <div className="flex flex-col px-2 pt-1 gap-2 mb-6">
            {newFileButton}
            {homeButton}
          </div>

          {fileTreeSection}
        </div>

        {/* Separate component for keyboard shortcuts */}
        <KeyboardShortcutsSection
          isExpanded={isExpanded}
          settings={settings}
          setIsSettingsOpen={setIsSettingsOpen}
        />
      </motion.nav>
    </motion.div>
  )
})
