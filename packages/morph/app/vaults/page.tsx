"use client"

import { usePathname, useRouter } from "next/navigation"
import { ClockIcon, ArchiveIcon, CardStackPlusIcon } from "@radix-ui/react-icons"
import { Button, VaultButton } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { type Vault } from "@/db"
import { useVaultContext } from "@/context/vault-context"
import { Skeleton } from "@/components/ui/skeleton"
import { useCallback, useMemo, useRef } from "react"
import { motion } from "motion/react"

export default function Home() {
  const router = useRouter()
  const pathname = usePathname()
  const clockRef = useRef<SVGSVGElement>(null)
  const searchRef = useRef<SVGSVGElement>(null)
  const { setActiveVaultId, vaults, addVault, isLoading } = useVaultContext()

  const handleOpenDirectory = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ startIn: "documents" })
      const vault = await addVault(handle)
      if (vault?.id) {
        router.push(`/vaults/${vault.id}`)
        setActiveVaultId(vault.id)
      }
    } catch {}
  }, [addVault, setActiveVaultId, router])

  const handleVaultSelect = useCallback(
    (vault: Vault) => {
      if (vault?.id) {
        router.push(`/vaults/${vault.id}`)
        setActiveVaultId(vault.id)
      }
    },
    [setActiveVaultId, router],
  )

  const renderVaults = useMemo(() => {
    // Only render on home page and when we have data
    if (pathname !== "/vaults" || !vaults) {
      return null
    }

    if (isLoading) {
      return (
        <Card className="group rounded-md">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-3 w-[160px]" />
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    if (Array.isArray(vaults) && vaults.length > 0) {
      const uniqueVaults = [...new Map(vaults.map((v) => [v.id, v])).values()]
      return uniqueVaults.map((vault, index) => (
        <motion.div
          key={vault.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.3,
            delay: index * 0.05,
            ease: [0.25, 0.1, 0.25, 1]
          }}
        >
          <Card className="group rounded-md">
            <Button
              variant="ghost"
              className="w-full h-auto p-0 justify-start cursor-pointer"
              onClick={() => handleVaultSelect(vault)}
            >
              <CardContent className="p-6 w-full">
                <div className="flex items-center justify-between w-full">
                  <CardTitle>{vault.name}</CardTitle>
                  <CardDescription className="text-right">
                    {new Date(vault.lastOpened).toLocaleDateString("en-US", {
                      month: "2-digit",
                      day: "2-digit",
                      year: "numeric",
                    })}
                  </CardDescription>
                </div>
              </CardContent>
            </Button>
          </Card>
        </motion.div>
      ))
    }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="group rounded-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ArchiveIcon className="w-10 h-10 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No Vaults Found</CardTitle>
            <CardDescription>Get started by opening a new vault.</CardDescription>
          </CardContent>
        </Card>
      </motion.div>
    )
  }, [isLoading, vaults, handleVaultSelect, pathname])

  return (
    <motion.main
      className="min-h-screen w-full flex items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="container max-w-4xl p-8 border rounded-md shadow-md"
        layoutId="playspace-container"
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
          mass: 0.8,
        }}
      >
        <motion.section
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <motion.hgroup>
            <motion.h1 className="text-3xl font-bold tracking-tight">Vaults</motion.h1>
          </motion.hgroup>
          <VaultButton onClick={handleOpenDirectory} title="Open New Vault" color="cyan">
            <CardStackPlusIcon className="w-4 h-4" ref={searchRef} />
          </VaultButton>
        </motion.section>
        <motion.div
          className="flex items-center gap-2 text-sm text-muted-foreground my-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <ClockIcon className="w-4 h-4" ref={clockRef} />
          <p>recently opened vaults</p>
        </motion.div>
        <motion.section
          className="grid gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <div className="grid gap-4">{renderVaults}</div>
        </motion.section>
      </motion.div>
    </motion.main>
  )
}
