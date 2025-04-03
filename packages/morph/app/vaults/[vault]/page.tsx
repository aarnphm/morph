"use client"

import { motion } from "motion/react"
import { useParams } from "next/navigation"
import { useCallback, useEffect } from "react"

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

  const MemoizedEditor = useCallback(
    () => <Editor vaultId={vaultId} vaults={vaults} />,
    [vaultId, vaults],
  )

  return (
    <motion.main
      className="min-h-screen bg-background overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        transition: {
          duration: 0.2,
          delay: 0.1,
        },
      }}
      transition={{
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      <FilePreloader />
      <MemoizedEditor />
    </motion.main>
  )
}
