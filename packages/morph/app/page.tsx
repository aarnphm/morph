"use client"

import Link from "next/link"
import { EnterIcon, DoubleArrowRightIcon } from "@radix-ui/react-icons"
import { PixelatedScene } from "@/components/landing"
import { VaultButton } from "@/components/ui/button"
import { PageTransition } from "@/components/landing/page-transition"
import { useEffect, useState } from "react"

export default function LandingPage() {
  const [showMobilePopup, setShowMobilePopup] = useState(false)

  useEffect(() => {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent)

    if (isMobile) {
      setShowMobilePopup(true)
    }
  }, [])

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
        {showMobilePopup && (
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/50 p-5">
              <div className="bg-white p-6 rounded shadow-md text-center">
                <h2 className="text-lg font-bold mb-2">Mobile Support Coming Soon</h2>
                <p className="mb-4">
                In the meantime, please access the vault editor using a desktop device.
                </p>
                <a
                href="https://github.com/aarnphm/morph"
                className="bg-green-500 text-white px-4 py-2 rounded"
                >
                Go to GitHub
                </a>
              </div>
            </div>
        )}
      </div>
    </PageTransition>
  )
}
