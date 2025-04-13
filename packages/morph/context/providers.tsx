"use client"

import { applyMigrations, initialize } from "@/db"
import migrations from "@/generated/migrations.json"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { AnimatePresence, motion } from "motion/react"
import type React from "react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"

import PixelatedLoading from "@/components/landing/pixelated-loading"

import { AuthorTasksProvider } from "@/context/authors"
import { MorphPgLite, PGliteProvider } from "@/context/db"
import { EmbeddingProvider } from "@/context/embedding"
import { NotesProvider } from "@/context/notes"
import { ThemeProvider } from "@/context/theme"
import { VaultProvider } from "@/context/vault"

import { SettingsProvider } from "@/hooks/use-persisted-settings"

export default memo(function ClientProvider({ children }: { children: React.ReactNode }) {
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

        const dbInstance = await initialize()
        await applyMigrations(dbInstance, migrations)
        // Set DB instance and finish loading
        setDb(dbInstance)
        setLoadingProgress(1)
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
                          <NotesProvider>{children}</NotesProvider>
                        </ThemeProvider>
                      </SettingsProvider>
                    </VaultProvider>
                  </AuthorTasksProvider>
                </EmbeddingProvider>
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
