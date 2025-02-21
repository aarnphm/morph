import { useState, useEffect } from "react"
import { useVaultContext } from "@/context/vault-context"
import { defaultSettings } from "@/db"

export interface Settings {
  vimMode: boolean
  tabSize: number
  ignorePatterns: string[]
  editModeShortcut: string
  notePanelShortcut: string
  citation: {
    enabled: boolean
    format: "biblatex" | "csl-json"
    databasePath?: string
  }
}

export default function usePersistedSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
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
        const morphDir = await vault.tree.handle.getDirectoryHandle(".morph", { create: true })
        const configFile = await morphDir.getFileHandle("config.json", { create: true })
        const file = await configFile.getFile()
        const text = await file.text()

        if (text) {
          const parsedSettings = { ...defaultSettings, ...JSON.parse(text) }
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
      if (!vault?.handle) return

      const updated = { ...settings, ...newSettings }
      setSettings(updated)

      // Save to .morph/config.json
      const morphDir = await vault.tree.handle.getDirectoryHandle(".morph", { create: true })
      const configFile = await morphDir.getFileHandle("config.json", { create: true })
      const writable = await configFile.createWritable()
      await writable.write(JSON.stringify(updated, null, 2))
      await writable.close()
    } catch (error) {
      console.error("Failed to save settings:", error)
    }
  }

  return {
    settings,
    updateSettings,
    isLoaded,
    defaultSettings,
  }
}
