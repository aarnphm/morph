import type * as React from "react"
import { useState, useCallback, memo, useMemo } from "react"
import {
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  DownloadIcon,
  HomeIcon,
  GearIcon,
} from "@radix-ui/react-icons"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { EditorView } from "@uiw/react-codemirror"
import { setFile } from "@/components/markdown-inline"
import { Vault, FileSystemTreeNode } from "@/db"
import { SettingsPanel } from "@/components/settings-panel"

interface FileTreeNodeProps {
  node: FileSystemTreeNode
  onFileSelect?: (node: FileSystemTreeNode) => void
}

// TODO: reducer and context for states
// https://react.dev/learn/scaling-up-with-reducer-and-context
const FileTreeNode = memo(function FileTreeNode({ node, onFileSelect }: FileTreeNodeProps) {
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
          <SidebarMenuButton onClick={toggleOpen} className="w-full">
            {isOpen ? (
              <ChevronDownIcon className="transition-transform w-4 h-4 mr-1 shrink-0" />
            ) : (
              <ChevronRightIcon className="transition-transform w-4 h-4 mr-1 shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0">
            {node.children &&
              node.children.map((child) => (
                <FileTreeNode
                  key={`${child.name}.${child.extension}`}
                  node={child}
                  onFileSelect={onFileSelect}
                />
              ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    ),
    [isOpen, toggleOpen, node, onFileSelect],
  )

  const MemoizedSidebarFileItem = useMemo(
    () => (
      <SidebarMenuButton
        className="data-[active=true]:bg-transparent hover:bg-accent/50 transition-colors flex items-center cursor-pointer w-full"
        onClick={handleFileClick}
      >
        <span className="truncate">{node.name}</span>
        {node.extension && node.extension !== "md" && (
          <span className="text-muted-foreground uppercase text-tiny flex-shrink-0 border rounded px-1 ml-2">
            {node.extension}
          </span>
        )}
      </SidebarMenuButton>
    ),
    [handleFileClick, node],
  )

  if (node.kind === "file") return MemoizedSidebarFileItem

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible" asChild>
      {MemoizedSidebarFolderItem}
    </Collapsible>
  )
})

interface FileTreeProps extends React.ComponentProps<typeof Sidebar> {
  vault: Vault
  editorViewRef: React.RefObject<EditorView | null>
  onFileSelect?: (handle: FileSystemFileHandle) => void
  onNewFile?: () => void
  onContentUpdate?: (content: string) => void
  onExportMarkdown: () => void
}

interface ExplorerHeaderProps {
  vault: Vault | undefined
  editorViewRef: React.RefObject<EditorView | null>
  onNewFile?: () => void
  onExportMarkdown: () => void
}

const ExplorerHeader = memo(function ExplorerHeader({
  vault,
  editorViewRef,
  onNewFile,
  onExportMarkdown,
}: ExplorerHeaderProps) {
  const router = useRouter()

  const onManageVault = useCallback(() => {
    router.push("/vaults")
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

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false)
  }, [])

  return (
    <SidebarHeader className="border-b h-10 p-0 min-h-10 sticky">
      <div className="h-full flex items-center justify-end mx-4 gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 group"
          title="Manage Vault"
          onClick={onManageVault}
        >
          <HomeIcon className="h-3 w-3 p-0" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          title="New File"
          disabled={!vault}
          onClick={onNewFileClick}
        >
          <PlusIcon className="h-3 w-3" width={16} height={16} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Export">
              <DownloadIcon className="h-3 w-3" width={16} height={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" sideOffset={5} alignOffset={2}>
            <DropdownMenuItem onClick={onExportMarkdown}>Markdown</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleOpenSettings}>
          <GearIcon className="h-3 w-3" width={16} height={16} />
        </Button>
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={handleCloseSettings}
          setIsOpen={setIsSettingsOpen}
        />
      </div>
    </SidebarHeader>
  )
})

export default memo(function Explorer({
  vault,
  editorViewRef,
  onFileSelect,
  onNewFile,
  onContentUpdate,
  onExportMarkdown,
  ...props
}: FileTreeProps) {
  const { toast } = useToast()

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

        if (onFileSelect) onFileSelect(node.handle as FileSystemFileHandle)

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

  return (
    <Sidebar {...props}>
      <ExplorerHeader
        vault={vault}
        editorViewRef={editorViewRef}
        onNewFile={onNewFile}
        onExportMarkdown={onExportMarkdown}
      />
      <SidebarContent>
        <SidebarGroup>
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
      <SidebarRail />
    </Sidebar>
  )
})
