import { useState, useCallback, useMemo, memo } from "react"
import { GearIcon } from "@radix-ui/react-icons"
import { Button } from "@/components/ui/button"
import { SettingsPanel } from "./settings-panel"

export const Toolbar = memo(function Toolbar() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true)
  }, [])

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
        <div className="flex items-center gap-4">{MemoizedSettingsButton}</div>
      </div>
      {MemoizedSettingsPanel}
    </>
  )
})
