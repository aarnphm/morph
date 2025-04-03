"use client"

import { AnimatePresence } from "motion/react"

export default function Template({ children }: { children: React.ReactNode }) {
  return <AnimatePresence mode="wait" initial={false}>{children}</AnimatePresence>
}
