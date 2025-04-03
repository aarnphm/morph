"use client"

import { applyPgLiteMigrations, initializeDb } from "@/db"
import migrations from "@/generated/migrations.json"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { drizzle } from "drizzle-orm/pglite"
import { AnimatePresence, motion } from "motion/react"
import type React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import PixelatedLoading from "@/components/landing/pixelated-loading"
import { TooltipProvider } from "@/components/ui/tooltip"

import { MorphPgLite, PGliteProvider } from "@/context/db"
import { FileRestorationProvider, useRestoredFile } from "@/context/file-restoration"
import { ThemeProvider } from "@/context/theme"
import { VaultProvider } from "@/context/vault"
import { verifyHandle } from "@/context/vault-reducer"

import useFsHandles from "@/hooks/use-fs-handles"

import * as schema from "@/db/schema"

interface ClientProviderProps {
  children: React.ReactNode
}

// Helper function to attempt file restoration
async function restoreLastFile(vaultId: string, getHandle: any) {
  try {
    const lastFileInfoStr = localStorage.getItem(`morph:last-file:${vaultId}`)
    if (!lastFileInfoStr) {
      console.debug("No last file info found for vault:", vaultId)
      return null
    }

    const lastFileInfo = JSON.parse(lastFileInfoStr)
    console.debug("Found last file info for vault:", vaultId, lastFileInfo)

    if (!lastFileInfo.handleId) {
      console.debug("No handle ID in last file info")
      return null
    }

    const handle = await getHandle(lastFileInfo.handleId)
    if (!handle || !("getFile" in handle)) {
      console.debug("Could not retrieve valid file handle")
      return null
    }

    // Verify handle is valid
    const isValid = await verifyHandle(handle)
    if (!isValid) {
      console.debug("Handle permission verification failed")
      return null
    }

    // Get file and content
    const fileHandle = handle as FileSystemFileHandle
    const file = await fileHandle.getFile()

    return {
      file,
      fileHandle,
      fileName: file.name,
      content: await file.text(),
      handleId: lastFileInfo.handleId,
    }
  } catch (error) {
    console.error("Error pre-loading file:", error)
    return null
  }
}

// Component that handles file preloading
function FilePreloader() {
  const { getHandle } = useFsHandles()
  const { setRestoredFile, setIsRestorationAttempted } = useRestoredFile()
  const fileRestorationRef = useRef<boolean>(false)

  useEffect(() => {
    if (fileRestorationRef.current) return
    fileRestorationRef.current = true

    async function preloadFile() {
      try {
        // Get active vault from localStorage
        const activeVaultId = localStorage.getItem("morph:active-vault")
        if (activeVaultId) {
          // Try to restore file for the active vault
          const restoredFile = await restoreLastFile(activeVaultId, getHandle)

          if (restoredFile) {
            // We successfully preloaded a file
            setRestoredFile(restoredFile)
            console.debug("Successfully preloaded file:", restoredFile.fileName)
          }
        }
      } catch (fileError) {
        console.error("Error during file preloading:", fileError)
      } finally {
        // Mark file restoration as attempted
        setIsRestorationAttempted(true)
      }
    }

    preloadFile()
  }, [getHandle, setRestoredFile, setIsRestorationAttempted])

  return null
}

export default memo(function ClientProvider({ children }: ClientProviderProps) {
  const queryClient = useMemo(() => new QueryClient(), [])
  const [db, setDb] = useState<MorphPgLite | undefined>()
  const [isDbLoading, setIsDbLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [transitionComplete, setTransitionComplete] = useState(false)

  useEffect(() => {
    async function setupDbAndMigrate() {
      setIsDbLoading(true)
      setLoadingProgress(0)

      try {
        // Simulate progress updates for 0-50%
        const progressInterval = setInterval(() => {
          setLoadingProgress((prev) => {
            const newProgress = prev + 0.05
            return newProgress > 0.5 ? 0.5 : newProgress
          })
        }, 200)

        const dbInstance = await initializeDb()
        await applyPgLiteMigrations(dbInstance, migrations)

        // Set up Drizzle with the DB instance
        drizzle({ client: dbInstance, schema })

        clearInterval(progressInterval)
        setLoadingProgress(0.6) // DB is ready at 60%
        setDb(dbInstance)

        // Now start file pre-loading - this now happens in the FilePreloader component
        // Move to 70% to indicate file preloading has started
        setLoadingProgress(0.7)

        // Wait a bit for file preloading to complete
        setTimeout(() => {
          // Move to 90% progress
          setLoadingProgress(0.9)

          // Final progress - loading complete
          setTimeout(() => {
            setLoadingProgress(1)
          }, 200)
        }, 500)
      } catch (err) {
        console.error("Error initializing database:", err)
        setLoadingProgress(1) // Move to 100% even on error so UI can show
      } finally {
        setIsDbLoading(false)
      }
    }

    setupDbAndMigrate()
  }, [])

  const handleTransitionComplete = useCallback(() => {
    setTransitionComplete(true)
  }, [])

  const motionProps = useMemo(
    () => ({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.8 },
      className: "w-full h-full",
    }),
    [],
  )

  return (
    <>
      <PixelatedLoading
        isLoading={isDbLoading}
        progress={loadingProgress}
        onTransitionComplete={handleTransitionComplete}
      />
      <AnimatePresence initial={false}>
        {!isDbLoading && db && transitionComplete && (
          <motion.div {...motionProps}>
            <PGliteProvider db={db}>
              <QueryClientProvider client={queryClient}>
                <FileRestorationProvider>
                  <FilePreloader />
                  <VaultProvider>
                    <ThemeProvider
                      attribute="class"
                      defaultTheme="system"
                      enableSystem
                      disableTransitionOnChange
                    >
                      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
                        {children}
                      </TooltipProvider>
                    </ThemeProvider>
                  </VaultProvider>
                  <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
                </FileRestorationProvider>
              </QueryClientProvider>
            </PGliteProvider>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
})
