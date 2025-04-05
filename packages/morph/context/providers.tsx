"use client"

import { applyMigrations, initialize } from "@/db"
import migrations from "@/generated/migrations.json"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { AnimatePresence, motion } from "motion/react"
import type React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import PixelatedLoading from "@/components/landing/pixelated-loading"

import { AuthorTasksProvider } from "@/context/authors"
import { MorphPgLite, PGliteProvider } from "@/context/db"
import { EmbeddingProvider } from "@/context/embedding"
import { FileRestorationProvider, useRestoredFile } from "@/context/file-restoration"
import { ThemeProvider } from "@/context/theme"
import { VaultProvider } from "@/context/vault"
import { verifyHandle } from "@/context/vault-reducer"

import useFsHandles from "@/hooks/use-fs-handles"
import { SettingsProvider } from "@/hooks/use-persisted-settings"

interface ClientProviderProps {
  children: React.ReactNode
}

// Helper function to attempt file restoration
async function restoreLastFile(vaultId: string, getHandle: any) {
  try {
    const lastFileInfoStr = localStorage.getItem(`morph:last-file:${vaultId}`)
    if (!lastFileInfoStr) {
      return null
    }

    const lastFileInfo = JSON.parse(lastFileInfoStr)

    if (!lastFileInfo.handleId) {
      return null
    }

    const handle = await getHandle(lastFileInfo.handleId)
    if (!handle || !("getFile" in handle)) {
      return null
    }

    // Verify handle is valid
    const isValid = await verifyHandle(handle)
    if (!isValid) {
      return null
    }

    // Get file and content
    const fileHandle = handle as FileSystemFileHandle
    const file = await fileHandle.getFile()

    return {
      file,
      fileHandle,
      content: await file.text(),
      handleId: lastFileInfo.handleId,
      fileId: lastFileInfo.fileId || "",
    }
  } catch (error) {
    console.error("Error pre-loading file:", error)
    return null
  }
}

// Component that handles file preloading - exported to be used in vault-specific routes
export function FilePreloader() {
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
  const [contentReady, setContentReady] = useState(false)

  useEffect(() => {
    async function setup() {
      setIsDbLoading(true)
      setLoadingProgress(0)

      try {
        // Show some initial progress
        setLoadingProgress(0.3)

        await initialize().then(async (db) => {
          await applyMigrations(db, migrations)
          // Set DB instance and finish loading
          setDb(db)
          setLoadingProgress(1)
        })
      } catch (err) {
        console.error("Error initializing database:", err)
        setLoadingProgress(1)
      } finally {
        setIsDbLoading(false)
      }
    }
    setup()
  }, [])

  // Handle transition from loading to content
  const handleTransitionComplete = useCallback(() => {
    // Use requestIdleCallback to ensure the browser has capacity
    // to handle the transition before mounting heavy components
    const prepareContent = () => {
      setTransitionComplete(true)

      // Small delay before marking content as ready to mount
      setTimeout(() => {
        setIsDbLoading(false)
        setContentReady(true)
      }, 100)
    }

    if (window.requestIdleCallback) {
      window.requestIdleCallback(prepareContent)
    } else {
      setTimeout(prepareContent, 50)
    }
  }, [])

  const motionProps = useMemo(
    () => ({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.8, delay: 0.2 }, // Add delay to ensure loading fully completes
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
        {contentReady && db && transitionComplete && (
          <motion.div {...motionProps}>
            <PGliteProvider db={db}>
              <QueryClientProvider client={queryClient}>
                <FileRestorationProvider>
                  <EmbeddingProvider>
                    <AuthorTasksProvider>
                      <VaultProvider>
                        <SettingsProvider>
                          <ThemeProvider
                            attribute="class"
                            defaultTheme="system"
                            enableSystem
                            disableTransitionOnChange
                          >
                            {children}
                          </ThemeProvider>
                        </SettingsProvider>
                      </VaultProvider>
                    </AuthorTasksProvider>
                  </EmbeddingProvider>
                </FileRestorationProvider>
                <ReactQueryDevtools
                  initialIsOpen={false}
                  buttonPosition="bottom-left"
                  position="bottom"
                  client={queryClient}
                />
              </QueryClientProvider>
            </PGliteProvider>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
})
