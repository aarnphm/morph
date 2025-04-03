"use client"

import { applyPgLiteMigrations, initializeDb } from "@/db"
import migrations from "@/generated/migrations.json"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { AnimatePresence, motion } from "motion/react"
import type React from "react"
import { useEffect, useState, useMemo, useCallback, memo } from "react"

import PixelatedLoading from "@/components/landing/pixelated-loading"

import { MorphPgLite, PGliteProvider } from "@/context/db"
import { ThemeProvider } from "@/context/theme"
import { VaultProvider } from "@/context/vault"
import { TooltipProvider } from "@/components/ui/tooltip"

interface ClientProviderProps {
  children: React.ReactNode
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
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setLoadingProgress((prev) => {
            const newProgress = prev + 0.1
            return newProgress > 0.9 ? 0.9 : newProgress
          })
        }, 200)

        const dbInstance = await initializeDb()
        await applyPgLiteMigrations(dbInstance, migrations)

        clearInterval(progressInterval)
        setLoadingProgress(1)
        setDb(dbInstance)
      } catch (err) {
        console.error("Error initializing database:", err)
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
    []
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
              </QueryClientProvider>
            </PGliteProvider>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
})
