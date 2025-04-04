"use client"

import { motion } from "motion/react"
import { useParams } from "next/navigation"
import { useCallback, useEffect } from "react"

import Editor from "@/components/editor"

import { FilePreloader } from "@/context/providers"
import { useVaultContext } from "@/context/vault"

// Define page transition variants
const pageVariants = {
  initial: {
    opacity: 0,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1],
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

// Define child element variants for staggered animation
const childVariants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 }
  },
};

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
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      layoutId={`vault-page-${vaultId}`}
    >
      <motion.div
        variants={childVariants}
        className="w-full h-full"
      >
        <FilePreloader />
        <MemoizedEditor />
      </motion.div>
    </motion.main>
  )
}
