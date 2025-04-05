import { createContext, ReactNode, useContext, useEffect, useState } from "react"

import { useVaultContext } from "@/context/vault"

import { DEFAULT_SETTINGS, Settings } from "@/db/interfaces"

// Create a context for settings
interface SettingsContextType {
  settings: Settings
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  isLoaded: boolean
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

// Create a provider component
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)
  const { getActiveVault } = useVaultContext()

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const vault = getActiveVault()
        if (!vault?.tree.handle) {
          setIsLoaded(true)
          return
        }

        // Get the .morph directory handle
        const handle = vault.tree.handle as FileSystemDirectoryHandle
        const morphDir = await handle.getDirectoryHandle(".morph", { create: true })
        const configFile = await morphDir.getFileHandle("config.json", { create: true })
        const file = await configFile.getFile()
        const text = await file.text()

        if (text) {
          const parsedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(text) }
          setSettings(parsedSettings)
        }
      } catch (error) {
        console.error("Failed to load settings:", error)
      } finally {
        setIsLoaded(true)
      }
    }

    loadSettings()
  }, [getActiveVault])

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      const vault = getActiveVault()
      if (!vault?.tree.handle) return

      const updated = { ...settings, ...newSettings }
      setSettings(updated)

      // Set a localStorage flag if vim mode is changed
      if (newSettings.vimMode !== undefined && newSettings.vimMode !== settings.vimMode) {
        localStorage.setItem('morph:vim-mode-changed', 'true')
        localStorage.setItem('morph:vim-mode-value', newSettings.vimMode ? 'true' : 'false')
      }

      // Save to .morph/config.json
      const handle = vault.tree.handle as FileSystemDirectoryHandle
      const morphDir = await handle.getDirectoryHandle(".morph", { create: true })
      const configFile = await morphDir.getFileHandle("config.json", { create: true })
      const writable = await configFile.createWritable()
      await writable.write(JSON.stringify(updated, null, 2))
      await writable.close()
    } catch (error) {
      console.error("Failed to save settings:", error)
    }
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoaded }}>
      {children}
    </SettingsContext.Provider>
  )
}

// Export the hook
export default function usePersistedSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error("usePersistedSettings must be used within a SettingsProvider")
  }
  return context
}
