"use client"

import {
  SearchQuery,
  search as createBaseSearch,
  findNext,
  findPrevious,
  setSearchQuery,
} from "@codemirror/search"
import { StateEffect } from "@codemirror/state"
import { EditorView, Panel, keymap } from "@codemirror/view"
import * as React from "react"
import { createRoot } from "react-dom/client"

import { SearchPanel } from "./search-panel"

/**
 * Custom effect to toggle search panel visibility
 */
export const toggleSearchPanel = StateEffect.define<boolean>()

/**
 * Creates a custom search extension for CodeMirror that renders the React SearchPanel component
 * and includes keyboard shortcuts
 */
export function search() {
  // Track if the search panel is open
  let panelOpen = false
  let searchRoot: ReturnType<typeof createRoot> | null = null

  // Create search extension with custom panel
  const searchExtension = createBaseSearch({
    top: true,
    createPanel: (view: EditorView): Panel => {
      // Create container element for our React component
      const dom = document.createElement("div")
      dom.className = "cm-search-panel-container"

      // Ensure the container has relative positioning for the absolute positioned search panel
      dom.style.position = "relative"
      dom.style.width = "100%"
      dom.style.height = "0"
      dom.style.overflow = "visible"

      // Search panel will be positioned absolutely within this container
      // The actual centering is handled by the SearchPanel component's CSS

      // Create React root and render the search panel
      searchRoot = createRoot(dom)

      // Function to close/hide the panel
      const close = () => {
        // Hide panel
        panelOpen = false

        // Dispatch effect to close panel
        view.dispatch({
          effects: [toggleSearchPanel.of(false)]
        })

        // Focus the editor
        view.focus()

        // Return true to indicate panel should be removed
        return true
      }

      // Safe render function to avoid React concurrency issues
      const safeRender = () => {
        if (!searchRoot) return

        try {
          searchRoot.render(<SearchPanel view={view} isVisible={true} onClose={close} />)

          // Mark panel as open
          panelOpen = true
        } catch (err) {
          console.error("Error rendering search panel:", err)
        }
      }

      // Initial render
      safeRender()

      return {
        dom,
        top: true,
        mount: () => {
          // Panel is already mounted by React
          panelOpen = true
        },
        destroy: () => {
          // Schedule unmounting for after the current render cycle
          setTimeout(() => {
            if (searchRoot) {
              try {
                searchRoot.unmount()
                searchRoot = null
              } catch (err) {
                console.error("Error unmounting search panel:", err)
              }
            }
            panelOpen = false
          }, 0)
        },
      }
    },
  })

  // Custom keyboard bindings for search functionality
  const searchKeymap = keymap.of([
    {
      key: "Mod-f",
      run: (view: EditorView) => {
        // If panel is already open, focus it
        if (panelOpen) {
          const input = view.dom.querySelector(".cm-search-panel-container input") as HTMLInputElement
          if (input) input.focus()
          return true
        }

        // Otherwise open panel
        view.dispatch({
          effects: [toggleSearchPanel.of(true)],
        })

        // Open search panel
        openSearchPanel(view)
        return true
      },
      preventDefault: true,
    },
    {
      key: "F3",
      run: (view: EditorView) => {
        // Open panel if not open
        if (!panelOpen) {
          view.dispatch({
            effects: [toggleSearchPanel.of(true)],
          })
          openSearchPanel(view)
        }
        findNext(view)
        return true
      },
    },
    {
      key: "Shift-F3",
      run: (view: EditorView) => {
        // Open panel if not open
        if (!panelOpen) {
          view.dispatch({
            effects: [toggleSearchPanel.of(true)],
          })
          openSearchPanel(view)
        }
        findPrevious(view)
        return true
      },
    },
    {
      key: "Mod-g",
      run: (view: EditorView) => {
        // Toggle panel - close if open, open if closed
        if (panelOpen) {
          view.dispatch({
            effects: [toggleSearchPanel.of(false)],
          })
          view.focus()
          return true
        }

        // Open panel if not open
        view.dispatch({
          effects: [toggleSearchPanel.of(true)],
        })
        openSearchPanel(view)
        findNext(view)
        return true
      },
      preventDefault: true,
    },
    {
      key: "Shift-Mod-g",
      run: (view: EditorView) => {
        // Open panel if not open
        if (!panelOpen) {
          view.dispatch({
            effects: [toggleSearchPanel.of(true)],
          })
          openSearchPanel(view)
        }
        findPrevious(view)
        return true
      },
      preventDefault: true,
    },
    {
      key: "Mod-[",
      run: (view: EditorView) => {
        // Open panel if not open
        if (!panelOpen) {
          view.dispatch({
            effects: [toggleSearchPanel.of(true)],
          })
          openSearchPanel(view)
        }
        findPrevious(view)
        return true
      },
    },
    {
      key: "Mod-]",
      run: (view: EditorView) => {
        // Open panel if not open
        if (!panelOpen) {
          view.dispatch({
            effects: [toggleSearchPanel.of(true)],
          })
          openSearchPanel(view)
        }
        findNext(view)
        return true
      },
    },
    {
      key: "Escape",
      run: (view: EditorView) => {
        // Only handle Escape if search panel is open
        if (!panelOpen) return false

        // Close search panel
        view.dispatch({
          effects: [toggleSearchPanel.of(false)],
        })

        // Focus editor
        view.focus()
        return true
      },
    },
  ])

  // Helper function to open search panel
  function openSearchPanel(view: EditorView) {
    const currentQuery = ""

    // Open panel with initial empty search
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: currentQuery,
          caseSensitive: false,
        }),
      ),
    })

    // Focus search input field (scheduled to ensure React has rendered)
    setTimeout(() => {
      const input = view.dom.querySelector(".cm-search-panel-container input") as HTMLInputElement
      if (input) input.focus()
    }, 10)

    return true
  }

  // Return combined extensions
  return [searchExtension, searchKeymap]
}
