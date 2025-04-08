"use client"

import { useParams } from "next/navigation"
import { useEffect } from "react"

import Editor from "@/components/editor"

import { FilePreloader } from "@/context/providers"
import { useNotesContext } from "@/context/notes"
import { useVaultContext } from "@/context/vault"

export default function VaultPage() {
  const params = useParams()
  const vaultId = params.vault as string
  const { vaults } = useVaultContext()
  const { dispatch } = useNotesContext()

  // Set active vault ID in localStorage whenever the vault ID changes
  useEffect(() => {
    if (vaultId) {
      localStorage.setItem("morph:active-vault", vaultId)
      // Set the current vault ID in the notes context
      dispatch({ type: 'SET_CURRENT_VAULT_ID', vaultId })
    }

    // Clean up when unmounting
    return () => {
      dispatch({ type: 'SET_CURRENT_VAULT_ID', vaultId: null })
      dispatch({ type: 'SET_CURRENT_FILE_ID', fileId: null })
      dispatch({ type: 'CLEAR_NOTES' })
    }
  }, [vaultId, dispatch])

  return (
    <main className="min-h-screen bg-background overflow-hidden">
      <div className="w-full h-full">
        <FilePreloader />
        <Editor vaultId={vaultId} vaults={vaults} />
      </div>
    </main>
  )
}
