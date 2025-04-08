import {
  Dispatch,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react"

import { useVaultContext } from "@/context/vault"

import { DEFAULT_SETTINGS, Settings } from "@/db/interfaces"

// Define action types
type SettingsAction =
  | { type: "LOAD_SETTINGS"; payload: Settings }
  | { type: "UPDATE_SETTINGS"; payload: Partial<Settings> }
  | { type: "SET_LOADED" }

// Settings reducer function
function settingsReducer(state: { settings: Settings; isLoaded: boolean }, action: SettingsAction) {
  switch (action.type) {
    case "LOAD_SETTINGS":
      return {
        ...state,
        settings: { ...DEFAULT_SETTINGS, ...action.payload },
        isLoaded: true,
      }
    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      }
    case "SET_LOADED":
      return {
        ...state,
        isLoaded: true,
      }
    default:
      return state
  }
}

// Create a context for settings
interface SettingsContextType {
  settings: Settings
  updateSettings: (newSettings: Partial<Settings>) => void
  isLoaded: boolean
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)
const SettingsDispatchContext = createContext<Dispatch<SettingsAction> | undefined>(undefined)

// Create a provider component
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(settingsReducer, {
    settings: DEFAULT_SETTINGS,
    isLoaded: false,
  })

  const { getActiveVault } = useVaultContext()
  const loadedVaultIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const loadSettings = () => {
      try {
        const vault = getActiveVault()
        if (!vault) {
          dispatch({ type: "SET_LOADED" })
          return
        }

        const vaultId = vault.id

        // Skip if we've already loaded settings for this vault
        if (loadedVaultIds.current.has(vaultId)) {
          return
        }

        // Mark this vault as loaded
        loadedVaultIds.current.add(vaultId)

        // Load settings from localStorage
        const storageKey = `morph:vaults:${vaultId}`
        const storedSettings = localStorage.getItem(storageKey)

        if (storedSettings) {
          const parsedSettings = JSON.parse(storedSettings)
          dispatch({ type: "LOAD_SETTINGS", payload: parsedSettings })
        } else {
          dispatch({ type: "LOAD_SETTINGS", payload: DEFAULT_SETTINGS })
        }
      } catch (error) {
        console.error("Failed to load settings:", error)
        dispatch({ type: "SET_LOADED" })
      }
    }

    loadSettings()
  }, [getActiveVault])

  const updateSettings = useCallback(
    (newSettings: Partial<Settings>) => {
      try {
        const vault = getActiveVault()
        if (!vault) return

        // Update state through reducer
        dispatch({ type: "UPDATE_SETTINGS", payload: newSettings })

        // Set a localStorage flag if vim mode is changed
        if (newSettings.vimMode !== undefined && newSettings.vimMode !== state.settings.vimMode) {
          localStorage.setItem("morph:vim-mode-changed", "true")
          localStorage.setItem("morph:vim-mode-value", newSettings.vimMode ? "true" : "false")
        }

        // Save to localStorage
        const storageKey = `morph:vaults:${vault.id}`
        const updatedSettings = { ...state.settings, ...newSettings }
        localStorage.setItem(storageKey, JSON.stringify(updatedSettings))
      } catch (error) {
        console.error("Failed to save settings:", error)
      }
    },
    [getActiveVault, state.settings],
  )

  const contextValue = {
    settings: state.settings,
    updateSettings,
    isLoaded: state.isLoaded,
  }

  return (
    <SettingsContext.Provider value={contextValue}>
      <SettingsDispatchContext.Provider value={dispatch}>
        {children}
      </SettingsDispatchContext.Provider>
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
