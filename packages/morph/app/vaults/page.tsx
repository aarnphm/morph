"use client"

import { ArchiveIcon, CardStackPlusIcon, ClockIcon, InfoCircledIcon } from "@radix-ui/react-icons"
import { motion } from "motion/react"
import { usePathname, useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import type { ComponentPropsWithoutRef } from "react"

import { Button, VaultButton } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { useVaultContext } from "@/context/vault"

import type { Vault } from "@/db/interfaces"

// Custom styled DialogContent to center it on the screen
const CenteredDialogContent = memo(function CenteredDialogContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogContent>) {
  return (
    <DialogContent
      className={`fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] sm:max-w-md ${className || ""}`}
      {...props}
    >
      {children}
    </DialogContent>
  )
})

const Notch = memo(function Notch({ onClickBanner }: { onClickBanner: () => void }) {
  return (
    <>
      <motion.svg
        className="absolute top-0 left-0 w-full h-10 pointer-events-none"
        preserveAspectRatio="none"
        viewBox="0 0 1000 32"
        xmlns="http://www.w3.org/2000/svg"
        style={{ zIndex: 10, willChange: "transform, opacity" }}
        initial={{ opacity: 0, scaleY: 0.7, y: -5 }}
        animate={{ opacity: 1, scaleY: 1, y: 0 }}
        transition={{
          duration: 0.7,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.2,
          opacity: { duration: 0.4 },
        }}
      >
        <defs>
          <filter
            id="shadow"
            x="-10%"
            y="-10%"
            width="120%"
            height="150%"
            colorInterpolationFilters="sRGB"
          >
            {/* Combine multiple drop shadows into a single filter for better performance */}
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="rgba(251, 191, 36, 0.5)" />
          </filter>
          <linearGradient
            id="buttonBlend"
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FEF3C7" stopOpacity="1" />
            <stop offset="100%" stopColor="#FEF3C7" stopOpacity="1" />
          </linearGradient>
        </defs>
        <motion.path
          d="M0,1
                 H390
                 C400,1 415,8 425,15
                 C435,22 445,25 475,25
                 H525
                 C555,25 565,22 575,15
                 C585,8 600,1 610,1
                 H1000"
          stroke="#FDE68A"
          strokeWidth="2.5"
          fill="url(#buttonBlend)"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#shadow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: 1,
            ease: "easeInOut",
            delay: 0.3,
          }}
        />
      </motion.svg>
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 cursor-pointer z-20 flex flex-row items-center gap-1 px-4 py-1 border-t-0"
        onClick={onClickBanner}
        style={{ willChange: "transform, opacity" }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.5,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.5,
        }}
      >
        <InfoCircledIcon className="h-3.5 w-3.5 text-amber-700" />
        <span className="text-xs font-medium text-amber-700">Research Preview</span>
      </motion.div>
    </>
  )
})

export default function Home() {
  const router = useRouter()
  const pathname = usePathname()
  const [showBannerDetails, setShowBannerDetails] = useState(false)
  const [hasAcknowledged, setHasAcknowledged] = useState(false)
  const { setActiveVaultId, vaults, addVault } = useVaultContext()

  useEffect(() => {
    const acknowledged = localStorage.getItem("morph-preview-acknowledged") === "true"
    setHasAcknowledged(acknowledged)

    // Auto-open dialog if user hasn't acknowledged yet
    if (!acknowledged) {
      setShowBannerDetails(true)
    }
  }, [])

  // Handle acknowledgment
  const handleAcknowledge = () => {
    localStorage.setItem("morph-preview-acknowledged", "true")
    setHasAcknowledged(true)
    setShowBannerDetails(false)
  }

  const onClickBanner = useCallback(
    () => setShowBannerDetails(!showBannerDetails),
    [showBannerDetails],
  )

  const handleOpenDirectory = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ startIn: "documents" })
      const vault = await addVault(handle)
      if (vault?.id) {
        // Store the last selected vault ID for animation purposes
        if (typeof window !== "undefined") {
          localStorage.setItem("lastSelectedVaultId", vault.id)
        }

        // Add a slight delay to allow any animations to complete
        setTimeout(() => {
          router.push(`/vaults/${vault.id}`)
          setActiveVaultId(vault.id)
        }, 50)
      }
    } catch {}
  }, [addVault, setActiveVaultId, router])

  const handleVaultSelect = useCallback(
    (vault: Vault) => {
      if (vault?.id) {
        // Store the last selected vault ID for animation purposes
        if (typeof window !== "undefined") {
          localStorage.setItem("lastSelectedVaultId", vault.id)
        }

        // Add a slight delay to allow any animations to complete
        setTimeout(() => {
          router.push(`/vaults/${vault.id}`)
          setActiveVaultId(vault.id)
        }, 50)
      }
    },
    [setActiveVaultId, router],
  )

  const renderVaults = useMemo(() => {
    // Only render on home page and when we have data
    if (pathname !== "/vaults" || !vaults) {
      return null
    }

    if (Array.isArray(vaults) && vaults.length > 0) {
      const uniqueVaults = [...new Map(vaults.map((v) => [v.id, v])).values()]
      return uniqueVaults.map((vault) => (
        <div key={vault.id}>
          <div className="group rounded-md border border-border overflow-hidden">
            <Button
              variant="ghost"
              className="w-full h-auto p-0 justify-start cursor-pointer"
              onClick={() => handleVaultSelect(vault)}
            >
              <CardContent className="p-6 w-full">
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col">
                    <CardTitle className="justify-start flex">{vault.name}</CardTitle>
                    <span className="text-xs text-muted-foreground mt-1 truncate max-w-xs">
                      {vault.rootPath
                        ? vault.rootPath
                        : vault.tree && vault.tree.path
                          ? vault.tree.path.replace(/^\//, "")
                          : "Local folder"}
                    </span>
                  </div>
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
          </div>
        </div>
      ))
    }

    return (
      <Card className="group rounded-md">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ArchiveIcon className="w-10 h-10 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No Vaults Found</CardTitle>
          <CardDescription>Get started by opening a new vault.</CardDescription>
        </CardContent>
      </Card>
    )
  }, [vaults, handleVaultSelect, pathname])

  return (
    <motion.main
      className="min-h-screen w-full flex flex-col items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Dialog open={showBannerDetails} onOpenChange={setShowBannerDetails}>
        <CenteredDialogContent>
          <DialogHeader>
            <DialogTitle>Research Preview</DialogTitle>
            <DialogDescription asChild className="text-foreground/70">
              <div className="space-y-3 mt-2 flex flex-col gap-2">
                <div>
                  <code className="bg-amber-100/50 px-1 py-0.5 rounded">morph</code> is currently in
                  research preview and uses experimental Chrome{" "}
                  <a
                    href="https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle"
                    className="text-blue-500 hover:underline"
                  >
                    APIs
                  </a>
                  .
                </div>
                <div>
                  Please make sure to use the latest version of Chrome for the best experience.{" "}
                  <code className="bg-amber-100/50 px-1 py-0.5 rounded">morph</code> is built with{" "}
                  <a
                    href="https://stephango.com/file-over-app"
                    className="text-orange-500 hover:underline"
                  >
                    file-over-app
                  </a>{" "}
                  philosophy in mind, therefore it will require permission to access your local
                  files.
                </div>
                <div>
                  We will only process Markdown files and{" "}
                  <span className="font-semibold">will not save</span> any of your data. Rather, you
                  have full <span className="font-semibold">ownership</span> of your data.
                </div>
                <div>
                  We also recommend to pair{" "}
                  <code className="bg-amber-100/50 px-1 py-0.5 rounded">morph</code> with Git to
                  track your changes locally for data backup.
                </div>
                <div>
                  Currently <code>morph</code> is only available on Desktop.
                </div>
                <div>
                  If you have any feedback, please reach out on{" "}
                  <a href="https://x.com/aarnphm_" className="text-blue-500 hover:underline">
                    Twitter
                  </a>{" "}
                  or{" "}
                  <a
                    href="https://github.com/aarnphm/morph/issues/new"
                    className="text-blue-500 hover:underline"
                  >
                    file an issue on GitHub
                  </a>
                  .
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          {!hasAcknowledged && (
            <DialogFooter className="mt-4">
              <Button
                onClick={handleAcknowledge}
                className="bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300"
              >
                I acknowledge
              </Button>
            </DialogFooter>
          )}
        </CenteredDialogContent>
      </Dialog>

      <div className="container max-w-4xl">
        <div className="relative">
          <div className="w-full bg-background border shadow-md border-border rounded-md relative overflow-hidden pt-10">
            <Notch onClickBanner={onClickBanner} />
            <div className="p-8">
              <section className="flex items-center justify-between mb-8">
                <hgroup>
                  <h1 className="text-3xl font-bold tracking-tight">Vaults</h1>
                </hgroup>
                <VaultButton onClick={handleOpenDirectory} title="Open New Vault" color="cyan">
                  <CardStackPlusIcon className="w-4 h-4" />
                </VaultButton>
              </section>
              <div className="flex items-center gap-2 text-sm text-muted-foreground my-4">
                <ClockIcon className="w-4 h-4" />
                <p>recently opened vaults</p>
              </div>
              <section className="grid gap-4">
                <div className="grid gap-4">{renderVaults}</div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </motion.main>
  )
}
