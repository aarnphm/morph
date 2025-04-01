"use client"

import { FileSystemTreeNode, Vault } from "@/db"
import { cn } from "@/lib/utils"
import { EditorView } from "@codemirror/view"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CrumpledPaperIcon,
  LayoutIcon,
  PinLeftIcon,
  PinRightIcon,
  PlusIcon,
} from "@radix-ui/react-icons"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { memo, useCallback, useMemo, useState } from "react"

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { useToast } from "@/hooks/use-toast"

interface FileTreeNodeProps {
  node: FileSystemTreeNode
  onFileSelect?: (node: FileSystemTreeNode) => void
  isExpanded?: boolean
}

// TODO: reducer and context for states
// https://react.dev/learn/scaling-up-with-reducer-and-context
export const FileTreeNode = memo(function FileTreeNode({
  node,
  onFileSelect,
  isExpanded,
}: FileTreeNodeProps) {
  const [isOpen, setIsOpen] = useState(node.isOpen ?? false)

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleFileClick = useCallback(() => {
    onFileSelect?.(node)
  }, [onFileSelect, node])

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
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pl-3">
            {node.children &&
              node.children.map((child) => (
                <FileTreeNode
                  key={`${child.name}.${child.extension}`}
                  node={child}
                  onFileSelect={onFileSelect}
                  isExpanded={isExpanded}
                />
              ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    ),
    [isOpen, toggleOpen, node, onFileSelect, isExpanded],
  )

  const MemoizedSidebarFileItem = useMemo(
    () => (
      <SidebarMenuButton
        className="data-[active=true]:bg-transparent hover:bg-accent/50 transition-colors flex items-center cursor-pointer w-full text-xs py-1"
        onClick={handleFileClick}
      >
        <span className={isExpanded ? "!whitespace-normal !break-words" : "truncate"}>
          {node.name}
        </span>
      </SidebarMenuButton>
    ),
    [handleFileClick, node, isExpanded],
  )

  // Filter out non-markdown files
  if (node.kind === "file" && node.extension !== "md") {
    return null
  }

  if (node.kind === "file") return MemoizedSidebarFileItem

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible" asChild>
      {MemoizedSidebarFolderItem}
    </Collapsible>
  )
})

interface RailsProps extends React.ComponentProps<typeof Sidebar> {
  vault: Vault
  editorViewRef: React.RefObject<EditorView | null>
  onFileSelect?: (node: FileSystemTreeNode) => void
  onNewFile?: () => void
  onContentUpdate?: (content: string) => void
}

export default memo(function Rails({
  className,
  vault,
  editorViewRef,
  onFileSelect,
  onNewFile,
  onContentUpdate,
}: RailsProps) {
  const { toast } = useToast()
  const { toggleSidebar, state } = useSidebar()
  const isExpanded = state === "expanded"
  const router = useRouter()

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

  const handleFileSelect = useCallback(
    async (node: FileSystemTreeNode) => {
      if (!vault || node.kind !== "file" || !editorViewRef.current) return
      if (node.extension !== "md") {
        toast({ title: "File picker", description: "Can only open markdown files" })
        return
      }

      try {
        const file = await node.handle.getFile()
        const content = await file.text()

        if (onFileSelect) onFileSelect(node)

        editorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: editorViewRef.current.state.doc.length,
            insert: content,
          },
          effects: setFile.of(file.name),
        })

        if (onContentUpdate) {
          onContentUpdate(content)
        }
      } catch (error) {
        console.error("Error reading file:", error)
      }
    },
    [vault, editorViewRef, onFileSelect, onContentUpdate, toast],
  )

  // TODO: Add settings panel back
  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        className={cn("fixed z-sidebar lg:sticky h-full", className)}
        animate={{
          width: isExpanded ? "16rem" : "3.05rem",
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
        }}
      >
        <motion.nav
          className={cn(
            "h-screen flex flex-col items-center py-4 gap-3 fixed top-0 left-0 z-20 border-border border-r",
            "shadow-xl !bg-bg-300 backdrop-blur-sm",
          )}
          animate={{
            width: isExpanded ? "16rem" : "3.05rem",
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            duration: 0.3,
          }}
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
                            opacity: { duration: 0.2 },
                            width: {
                              type: "spring",
                              stiffness: 300,
                              damping: 30,
                            },
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
                            opacity: { duration: 0.2 },
                            width: {
                              type: "spring",
                              stiffness: 300,
                              damping: 30,
                            },
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
            </div>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0, overflow: "hidden" }}
                  animate={{
                    opacity: 1,
                    height: "auto",
                    overflow: "visible",
                  }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    overflow: "hidden",
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                  className="flex flex-grow flex-col overflow-y-auto overflow-x-hidden relative px-2 mb-2"
                >
                  <h3 className="text-text-300 flex items-center gap-1.5 text-xs text-muted-foreground select-none pb-2 pl-2 sticky top-0 z-10 bg-gradient-to-b from-bg-200 from-50% to-bg-200/40">
                    Files
                  </h3>
                  <SidebarContent className="w-full p-0">
                    <SidebarGroup className="p-0">
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {vault &&
                            vault.tree!.children!.map((node, idx) => (
                              <FileTreeNode key={idx} node={node} onFileSelect={handleFileSelect} />
                            ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                  </SidebarContent>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.nav>
      </motion.div>
    </TooltipProvider>
  )
})
