"use client"

import Link from "next/link"
import { EnterIcon } from "@radix-ui/react-icons"
import { PixelatedScene } from "@/components/landing"
import { VaultButton } from "@/components/ui/button"

export default function LandingPage() {
  return (
    <div className="relative h-screen w-full bg-background flex flex-col items-center justify-center">
      <div className="w-full h-full absolute inset-0">
        <PixelatedScene />
      </div>
      <div className="absolute bottom-4 right-4 z-10">
        <Link href="/vaults">
          <VaultButton title="Open Vault" color="green">
            <EnterIcon className="w-4 h-4" />
          </VaultButton>
        </Link>
      </div>
    </div>
  )
}
