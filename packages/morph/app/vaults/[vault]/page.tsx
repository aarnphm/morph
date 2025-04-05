"use client"

import { useParams } from "next/navigation"
import { useEffect } from "react"

import Editor from "@/components/editor"

import { FilePreloader } from "@/context/providers"
import { useVaultContext } from "@/context/vault"

export default function VaultPage() {
  const params = useParams()
  const vaultId = params.vault as string
  const { vaults } = useVaultContext()

  // Set active vault ID in localStorage whenever the vault ID changes
  useEffect(() => {
    if (vaultId) {
      localStorage.setItem("morph:active-vault", vaultId)
    }
  }, [vaultId])

  return (
    <main className="min-h-screen bg-background overflow-hidden">
      <div className="w-full h-full">
        <FilePreloader />
        <Editor vaultId={vaultId} vaults={vaults} />
      </div>
    </main>
  )
}
