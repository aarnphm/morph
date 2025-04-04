import { cn } from "@/lib/utils"
import { Cross1Icon, GearIcon } from "@radix-ui/react-icons"
import { useTheme } from "next-themes"
import * as React from "react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"

import usePersistedSettings from "@/hooks/use-persisted-settings"

import { Settings } from "@/db/interfaces"

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
}

type SettingsCategory = {
  id: string
  label: string
}

const categories: SettingsCategory[] = [
  { id: "general", label: "General" },
  { id: "editor", label: "Editor" },
  { id: "keyboard", label: "Hotkeys" },
  { id: "core-plugins", label: "Core plugins" },
]

type PluginsCategory = {
  name: string
  description: string
  hasSettings: boolean
  id: keyof Settings
} & Omit<SettingsCategory, "id">

// Add core plugins configuration
const corePlugins: PluginsCategory[] = []

interface SettingItemProps {
  name: string | React.ReactNode
  description?: string
  children?: React.ReactNode
  isHeading?: boolean
  className?: string
}

const SettingItem = React.memo(function SettingItem({
  name,
  description,
  children,
  isHeading,
  className,
}: SettingItemProps) {
  return (
    <div
      className={cn(
        "setting-item",
        isHeading && "setting-item-heading dark:border-slate-600",
        "dark:text-slate-200",
        className,
      )}
    >
      <div className="setting-item-info">
        <div className="setting-item-name">{name}</div>
        <div className="setting-item-description dark:text-slate-400">{description}</div>
      </div>
      <div className="setting-item-control">{children}</div>
    </div>
  )
})

function SettingsButton({ className, ref, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      ref={ref}
      size="sm"
      className={cn(
        "bg-cyan-500 dark:bg-teal-600 text-white dark:text-white",
        "hover:bg-cyan-500/80 dark:hover:bg-teal-600/80",
        "transition-colors duration-200",
        className,
      )}
      {...props}
    />
  )
}

const GeneralSettings = React.memo(function GeneralSettings() {
  return (
    <div className="text-sm">
      <SettingItem name="App" isHeading />
      <SettingItem name="GitHub" description="If you wish to contribute or open new issues">
        <SettingsButton onClick={() => window.open("https://github.com/aarnphm/morph", "_blank")}>
          Open
        </SettingsButton>
      </SettingItem>
      <SettingItem name="Documentation" description="User manuals">
        <SettingsButton onClick={() => window.open("https://docs.morph-editor.app", "_blank")}>
          Open
        </SettingsButton>
      </SettingItem>
      <SettingItem name="Engineering" description="Engineering manuals">
        <SettingsButton
          onClick={() => window.open("https://engineering.morph-editor.app", "_blank")}
        >
          Open
        </SettingsButton>
      </SettingItem>
    </div>
  )
})

const EditorSettings = React.memo(function EditorSettings() {
  const { settings, updateSettings } = usePersistedSettings()
  const { theme, setTheme } = useTheme()

  const handleVimModeToggle = useCallback((checked: boolean) => {
    // Always update settings with the new value
    updateSettings({ vimMode: checked })

    // Note: updateSettings already sets the localStorage flags in use-persisted-settings.tsx
  }, [updateSettings])

  return (
    <div className="text-sm">
      <SettingItem name="Appearance" isHeading />

      <SettingItem name="Theme" description="Choose your preferred color theme">
        <RadioGroup
          value={theme}
          onValueChange={setTheme}
          defaultValue="comfortable"
          className="flex gap-4 hover:cursor-pointer"
        >
          {["light", "dark", "system"].map((el, index) => (
            <div key={index} className="flex items-center space-x-2 hover:cursor-pointer">
              <RadioGroupItem value={el} id={el} />
              <label htmlFor={el} className="capitalize">
                {el}
              </label>
            </div>
          ))}
        </RadioGroup>
      </SettingItem>

      <SettingItem name="Editor" isHeading />

      <SettingItem name="Vim Mode" description="Enable Vim key bindings for text editing">
        <Switch
          className="cursor-pointer"
          id="vim-mode"
          checked={settings.vimMode || false}
          onCheckedChange={handleVimModeToggle}
        />
      </SettingItem>
    </div>
  )
})

const HotkeySettings = React.memo(function HotkeySettings() {
  const { settings, updateSettings } = usePersistedSettings()

  const handleEditModeShortcutChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const key = e.target.value.slice(-1).toLowerCase()
      if (key.match(/[a-z]/i)) {
        updateSettings({ toggleEditMode: key })
      }
    },
    [updateSettings],
  )

  return (
    <div className="text-sm">
      <SettingItem name="Keyboard Shortcuts" isHeading />

      <SettingItem
        name="Edit Mode Toggle"
        description="Shortcut to toggle between edit and reading mode (⌘ or Ctrl + key)"
      >
        <input
          id="edit-mode-shortcut"
          type="text"
          value={settings.toggleEditMode}
          onChange={handleEditModeShortcutChange}
          className="w-10 text-center border"
        />
      </SettingItem>
    </div>
  )
})

const CorePluginsSettings = React.memo(function CorePluginsSettings({
  setActiveCategory,
}: {
  setActiveCategory: (id: string) => void
}) {
  const { settings, updateSettings } = usePersistedSettings()

  const CogMemo = React.useMemo(() => <GearIcon className="h-3 w-3" />, [])

  const pluginItems = React.useMemo(
    () =>
      corePlugins.map((plugin) => (
        <SettingItem key={plugin.id} name={plugin.name} description={plugin.description}>
          {plugin.hasSettings && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-600/50"
              onClick={() => setActiveCategory(plugin.id)}
            >
              {CogMemo}
            </Button>
          )}
          <Switch
            id={plugin.id}
            className="cursor-pointer"
            onCheckedChange={(checked) => {
              updateSettings({
                [plugin.id]: {
                  ...(settings[plugin.id] as Record<string, any>),
                  enabled: checked,
                },
              })
            }}
          />
        </SettingItem>
      )),
    [settings, updateSettings, setActiveCategory, CogMemo],
  )

  return (
    <div className="text-sm">
      <SettingItem name="Core Plugins" isHeading />
      {pluginItems}
    </div>
  )
})

const SidebarSettingItem = React.memo(function SidebarSettingItem({
  category,
  isActive,
  categoryId,
  setActiveCategory,
}: {
  category: SettingsCategory | PluginsCategory
  isActive: boolean
  categoryId: string
  setActiveCategory: (id: string) => void
}) {
  const handleClick = useCallback(() => {
    setActiveCategory(categoryId)
  }, [setActiveCategory, categoryId])

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 cursor-pointer",
        "dark:text-slate-200 dark:hover:bg-slate-600/50",
        isActive && "bg-cyan-500 dark:bg-teal-600 text-white dark:text-white",
      )}
    >
      {category.label}
    </button>
  )
})

function SidebarSettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-[12px]">
      <div className="italic text-sm text-muted-foreground dark:text-slate-400 py-2">{title}</div>
      <ScrollArea className="pb-2">
        <div className="space-y-1">{children}</div>
      </ScrollArea>
    </div>
  )
}

export const SettingsPanel = React.memo(function SettingsPanel({
  isOpen,
  onClose,
  setIsOpen,
}: SettingsPanelProps) {
  const [activeCategory, setActiveCategory] = useState("general")
  // We still need isLoaded for the initial render check
  const { isLoaded } = usePersistedSettings()

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose()
      } else if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setIsOpen((prev) => !prev)
      }
    },
    [isOpen, onClose, setIsOpen],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Don't render until settings are loaded from localStorage
  if (!isLoaded || !isOpen) return null

  const renderActiveCategory = () => {
    switch (activeCategory) {
      case "general":
        return <GeneralSettings />
      case "editor":
        return <EditorSettings />
      case "keyboard":
        return <HotkeySettings />
      case "core-plugins":
        return <CorePluginsSettings setActiveCategory={setActiveCategory} />
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background dark:bg-[#1e1e1e] rounded-xl w-[900px] max-w-[90vw] max-h-[85vh] flex border border-black/10 dark:border-slate-600 overflow-hidden relative">
        <div className="w-[240px] flex flex-col bg-gray-100 dark:bg-[#262626] rounded-l-xl z-10">
          <SidebarSettingGroup title="Options">
            {categories.map((category) => (
              <SidebarSettingItem
                key={category.id}
                category={category}
                isActive={activeCategory === category.id}
                categoryId={category.id}
                setActiveCategory={setActiveCategory}
              />
            ))}
          </SidebarSettingGroup>
          <SidebarSettingGroup title="Core plugins">
            {corePlugins.map((category) => (
              <SidebarSettingItem
                key={category.id}
                category={category}
                isActive={activeCategory === category.id}
                categoryId={category.id}
                setActiveCategory={setActiveCategory}
              />
            ))}
          </SidebarSettingGroup>
        </div>

        <div className="flex-1 relative rounded-r-xl z-10 dark:bg-[#1e1e1e] p-6">
          <Button
            variant="ghost"
            className="h-6 w-6 p-0 absolute top-3 right-3 bg-transparent hover:bg-slate-200 dark:hover:bg-slate-600/50 z-20"
            onClick={onClose}
          >
            <Cross1Icon className="h-3 w-3 p-0" width={16} height={16} />
          </Button>
          <ScrollArea className="h-[calc(85vh-60px)] pt-8 pb-16 px-12">
            {renderActiveCategory()}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
})
