"use client"

import { usePathname, useRouter } from "next/navigation"
import { MagnifyingGlassIcon, ClockIcon } from "@radix-ui/react-icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { type Vault } from "@/db"
import { useVaultContext } from "@/context/vault-context"
import { Skeleton } from "@/components/ui/skeleton"
import { useCallback, useMemo, useRef } from "react"

export default function Home() {
  const router = useRouter()
  const pathname = usePathname()
  const searchRef = useRef<SVGSVGElement>(null)
  const clockRef = useRef<SVGSVGElement>(null)

  const { setActiveVaultId, vaults, addVault, isLoading } = useVaultContext()

  const handleOpenDirectory = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ startIn: "documents" })
      const vault = await addVault(handle)
      if (vault?.id) {
        router.push(`/${vault.id}`)
        setActiveVaultId(vault.id)
      }
    } catch {}
  }, [addVault, setActiveVaultId, router])

  const handleVaultSelect = useCallback(
    (vault: Vault) => {
      if (vault?.id) {
        router.push(`/${vault.id}`)
        setActiveVaultId(vault.id)
      }
    },
    [setActiveVaultId],
  )

  const renderVaults = useMemo(() => {
    // Only render on home page and when we have data
    if (pathname !== "/" || !vaults) {
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
      const uniqueVaults = [...new Map(vaults.map(v => [v.id, v])).values()]
      return uniqueVaults.map((vault) => (
        <Card key={vault.id} className="group rounded-md">
          <Button
            variant="ghost"
            className="w-full h-auto p-0 justify-start cursor-pointer"
            onClick={() => handleVaultSelect(vault)}
          >
            <CardContent className="p-6">
              <CardTitle className="flex items-center justify-between">
                <span>{vault.name}</span>
              </CardTitle>
              <CardDescription>
                Last opened{" "}
                {new Date(vault.lastOpened).toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </CardDescription>
            </CardContent>
          </Button>
        </Card>
      ))
    }

    return (
      <Card className="group rounded-md">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <MagnifyingGlassIcon className="w-12 h-12 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No Vaults Found</CardTitle>
          <CardDescription>
            Get started by opening a new vault to use with{" "}
            <code className="font-light italic">morph</code>.
          </CardDescription>
        </CardContent>
      </Card>
    )
  }, [isLoading, vaults, handleVaultSelect, pathname])

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="container max-w-4xl py-8">
        <section className="flex items-center justify-between mb-8">
          <hgroup>
            <h1 className="text-3xl font-bold tracking-tight">Vaults</h1>
            <p className="text-muted-foreground mt-2 italic">Manage recently opened vaults</p>
          </hgroup>
          <Button onClick={handleOpenDirectory} className="gap-2 cursor-pointer">
            <MagnifyingGlassIcon className="w-4 h-4" ref={searchRef} />
            Open New Vault
          </Button>
        </section>
        <div className="flex items-center gap-2 text-sm text-muted-foreground my-4">
          <ClockIcon className="w-4 h-4" ref={clockRef} />
          Recently Opened
        </div>
        <section className="grid gap-4">
          <div className="grid gap-4">{renderVaults}</div>
        </section>
      </div>
    </main>
  )
}
