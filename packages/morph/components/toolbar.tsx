import { useState, useCallback, useMemo } from "react"
import { CopyIcon, GearIcon } from "@radix-ui/react-icons"
import { Button } from "@/components/ui/button"
import { SettingsPanel } from "./settings-panel"

interface ToolbarProps {
  toggleNotes: () => void
}

export function Toolbar({ toggleNotes }: ToolbarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true)
  }, [])

  const handleToggleNotes = useCallback(() => {
    toggleNotes()
  }, [toggleNotes])

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false)
  }, [])

  const MemoizedSettingsButton = useMemo(
    () => (
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleOpenSettings}>
        <GearIcon className="h-3 w-3" width={16} height={16} />
      </Button>
    ),
    [handleOpenSettings],
  )

  const MemoizedCopyIcon = useMemo(
    () => <CopyIcon className="h-3 w-3" width={16} height={16} />,
    [],
  )

  const MemoizedCopyButton = useMemo(
    () => (
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleToggleNotes}>
        {MemoizedCopyIcon}
      </Button>
    ),
    [handleToggleNotes, MemoizedCopyIcon],
  )

  const MemoizedSettingsPanel = useMemo(
    () => (
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        setIsOpen={setIsSettingsOpen}
      />
    ),
    [isSettingsOpen, handleCloseSettings, setIsSettingsOpen],
  )

  return (
    <>
      <div className="flex items-center justify-between backdrop-blur-sm bg-background/80 supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-4">
          {MemoizedSettingsButton}
          {MemoizedCopyButton}
        </div>
      </div>
      {MemoizedSettingsPanel}
    </>
  )
}
