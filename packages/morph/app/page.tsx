"use client"

import { DoubleArrowRightIcon, EnterIcon } from "@radix-ui/react-icons"
import dynamic from "next/dynamic"
import Link from "next/link"

import { VaultButton } from "@/components/ui/button"

import { useIsMobile } from "@/hooks/use-mobile"

// Lazy load the PixelatedScene to improve initial page load time
const PixelatedScene = dynamic(
  () => import("@/components/landing").then((mod) => mod.PixelatedScene),
  {
    ssr: false,
    loading: () => null,
  },
)

export default function LandingPage() {
  const isMobile = useIsMobile()

  return (
    <div className="relative h-screen w-full bg-background flex flex-col items-center justify-center noise-bg">
      {/* Only render the scene when not on mobile */}
      <div className="w-full h-full absolute inset-0">{!isMobile && <PixelatedScene />}</div>
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
      {isMobile && (
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
  )
}
