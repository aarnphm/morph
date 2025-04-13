"use client"

import { useParams, notFound } from "next/navigation"
import { useEffect } from "react"

import Editor from "@/components/editor"

import { useNotesContext } from "@/context/notes"
import { useVaultContext } from "@/context/vault"

export default function VaultPage() {
  const params = useParams()
  const vaultId = params.vault as string

  const { vaults, isLoading: vaultsLoading } = useVaultContext()
  const { dispatch } = useNotesContext()

  // Set active vault ID in localStorage whenever the vault ID changes
  useEffect(() => {
    if (vaultId) {
      localStorage.setItem("morph:active-vault", vaultId)
      // Set the current vault ID in the notes context
      dispatch({ type: "SET_CURRENT_VAULT_ID", vaultId })
    }

    // Clean up when unmounting
    return () => {
      dispatch({ type: "SET_CURRENT_VAULT_ID", vaultId: null })
      dispatch({ type: "CLEAR_NOTES" })
    }
  }, [vaultId, dispatch])

  // Check if the vault ID is valid once vaults are loaded
  useEffect(() => {
    // Wait until vaults are loaded and vaultId is available
    if (!vaultsLoading && vaultId && vaults.length > 0) {
      const vaultExists = vaults.some(vault => vault.id === vaultId)
      if (!vaultExists) {
        notFound()
      }    }
  }, [vaultId, vaults, vaultsLoading])

  // Add a check here as well to prevent rendering Editor if notFound was called
  // This might be redundant if notFound() stops execution, but good for clarity
  if (vaults.length > 0 && !vaults.some(vault => vault.id === vaultId)) {
      return null;
  }

  return (
    <main className="min-h-screen bg-background overflow-hidden">
      <div className="w-full h-full">
        <Editor vaultId={vaultId} vaults={vaults} />
      </div>
    </main>
  )
}
