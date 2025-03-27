"use client"

import { useCallback, useEffect } from "react"
import Editor from "@/components/editor"
import { useVaultContext } from "@/context/vault-context"
import { useParams } from "next/navigation"
import mermaid from "mermaid"

export default function VaultPage() {
  const params = useParams()
  const vaultId = params.vault as string
  const { vaults } = useVaultContext()

  useEffect(() => {
    const handleContentChange = async (event: CustomEventMap["mermaid-content"]) => {
      if (event.detail) {
        const cssVars = [
          "--color-red-400",
          "--color-orange-400",
          "--color-gray-400",
          "--color-slate-50",
          "--color-gray-200",
          "--color-accent",
          "--color-background",
          "--color-gray-700",
          "--font-mono",
        ]

        const cssVariables = cssVars.reduce(
          (acc, key) => {
            acc[key] = getComputedStyle(document.documentElement).getPropertyValue(key)
            return acc
          },
          {} as Record<string, string>,
        )
        const darkMode = document.documentElement.classList.contains("dark")

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: darkMode ? "dark" : "base",
          themeVariables: {
            fontFamily: cssVariables["--font-mono"],
            primaryColor: cssVariables["--color-slate-50"],
            primaryTextColor: cssVariables["--color-gray-700"],
            primaryBorderColor: cssVariables["--color-orange-400"],
            lineColor: cssVariables["--color-gray-700"],
            secondaryColor: cssVariables["--color-red-400"],
            tertiaryColor: cssVariables["--color-orange-400"],
            clusterBkg: cssVariables["--color-slate-50"],
            edgeLabelBackground: cssVariables["--color-accent"],
          },
        })
        window.mermaid = mermaid

        const nodes = document.querySelectorAll<HTMLDivElement>("pre > code.mermaid")
        await mermaid.run({ nodes })
      }
    }

    window.addEventListener("mermaid-content", handleContentChange)
    return () => window.removeEventListener("mermaid-content", handleContentChange)
  }, [])

  const MemoizedEditor = useCallback(
    () => <Editor vaultId={vaultId} vaults={vaults} />,
    [vaultId, vaults],
  )

  return (
    <main className="min-h-screen bg-background overflow-hidden">
      <MemoizedEditor />
    </main>
  )
}
