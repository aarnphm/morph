"use client"

import { applyPgLiteMigrations, initializeDb } from "@/db"
import migrations from "@/generated/migrations.json"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type React from "react"
import { useEffect, useRef, useState } from "react"

import PixelatedLoading from "@/components/landing/pixelated-loading"

import { MorphPgLite, PGliteProvider } from "@/context/db"
import { ThemeProvider } from "@/context/theme"
import { VaultProvider } from "@/context/vault"

interface ProvidersProps {
  children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  const queryClient = new QueryClient()
  const [db, setDb] = useState<MorphPgLite | undefined>()
  const [isDbLoading, setIsDbLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    async function setupDbAndMigrate() {
      setIsDbLoading(true)
      setLoadingProgress(0)
      try {
        const dbInstance = await initializeDb()

        await applyPgLiteMigrations(dbInstance, migrations)

        setDb(dbInstance)
      } catch (err) {
        console.error("Error initializing database:", err)
      } finally {
        setIsDbLoading(false)
      }
    }
    setupDbAndMigrate()
  }, [])

  useEffect(() => {
    const totalDuration = 150
    const simulationEndTime = totalDuration * 0.5
    const finalBurstDuration = 50

    if (loadingProgress < 1) {
      const startTime = Date.now()

      const updateProgress = () => {
        const now = Date.now()
        const elapsedTime = now - startTime

        if (isDbLoading) {
          const progress = Math.min(elapsedTime / simulationEndTime, 0.9)
          setLoadingProgress(progress)
          if (progress < 0.9) {
            progressIntervalRef.current = setTimeout(updateProgress, 16)
          } else {
            if (progressIntervalRef.current) clearTimeout(progressIntervalRef.current)
          }
        } else {
          const remainingProgress = 1 - loadingProgress
          const finalProgress = Math.min(
            loadingProgress + (elapsedTime / finalBurstDuration) * remainingProgress,
            1,
          )
          setLoadingProgress(finalProgress)
          if (finalProgress < 1) {
            progressIntervalRef.current = setTimeout(updateProgress, 16)
          } else {
            if (progressIntervalRef.current) clearTimeout(progressIntervalRef.current)
          }
        }
      }

      progressIntervalRef.current = setTimeout(updateProgress, 0)
    } else {
      if (progressIntervalRef.current) clearTimeout(progressIntervalRef.current)
    }

    return () => {
      if (progressIntervalRef.current) {
        clearTimeout(progressIntervalRef.current)
      }
    }
  }, [isDbLoading, loadingProgress])

  return (
    <>
      <PixelatedLoading isLoading={isDbLoading} progress={loadingProgress} />
      {loadingProgress >= 1 && db && (
        <PGliteProvider db={db}>
          <QueryClientProvider client={queryClient}>
            <VaultProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                {children}
              </ThemeProvider>
            </VaultProvider>
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
          </QueryClientProvider>
        </PGliteProvider>
      )}
    </>
  )
}
