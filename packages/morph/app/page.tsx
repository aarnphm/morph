"use client"

import Link from "next/link"
import { EnterIcon, DoubleArrowRightIcon } from "@radix-ui/react-icons"
import { PixelatedScene } from "@/components/landing"
import { VaultButton } from "@/components/ui/button"
import { PageTransition } from "@/components/landing/page-transition"

export default function LandingPage() {
  return (
    <PageTransition>
      <div className="relative h-screen w-full bg-background flex flex-col items-center justify-center">
        <div className="w-full h-full absolute inset-0">
          <PixelatedScene />
        </div>
        <div className="absolute bottom-4 right-4 z-10">
          <div className="relative">
            <Link href="/vaults">
              <VaultButton title="Open Vault" color="green">
                <EnterIcon className="w-4 h-4" />
              </VaultButton>
            </Link>
            <div className="chevron-container absolute -left-16 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <DoubleArrowRightIcon className="chevron-one w-4 h-4" />
              <DoubleArrowRightIcon className="chevron-two w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
