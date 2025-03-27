"use client"

import Link from "next/link"
import { CardStackMinusIcon } from "@radix-ui/react-icons"
import PixelatedScene from "@/components/landing/pixelated-scene"

export default function LandingPage() {
  return (
    <div className="relative h-screen w-full bg-background flex flex-col items-center justify-center">
      <div className="w-full h-full absolute inset-0">
        <PixelatedScene />
      </div>
      <div className="absolute bottom-4 right-4 z-10">
        <Link href="/vaults">
          <button
            className="flex items-center justify-center gap-2 h-8 w-8 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white transition-colors text-xs font-medium shadow-sm hover:cursor-pointer"
            title="Open Vault"
          >
            <CardStackMinusIcon className="w-4 h-4" />
          </button>
        </Link>
      </div>
    </div>
  )
}
