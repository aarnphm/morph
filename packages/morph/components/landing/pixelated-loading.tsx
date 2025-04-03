"use client"

import { Icosahedron } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { motion, useAnimation } from "motion/react"
import { useEffect, useRef, useState, memo } from "react"
import type * as THREE from "three"

interface PixelatedLoadingProps {
  isLoading: boolean
  progress: number
  onTransitionComplete?: () => void
}

// Constants to match the home screen
const bgColor = "#f2f0e5"
const wireframeColor = "#111111"

function LoadingIcosahedron() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.005
      meshRef.current.rotation.y += 0.005
    }
  })

  return (
    <Icosahedron ref={meshRef} args={[1, 0]}>
      <meshBasicMaterial wireframe color={wireframeColor} />
    </Icosahedron>
  )
}

// Memoized Canvas component to prevent recreating the Canvas during transitions
const ThreeCanvas = memo(function ThreeCanvas() {
  return (
    <Canvas gl={{ antialias: false }}>
      <ambientLight intensity={0.5} />
      <LoadingIcosahedron />
    </Canvas>
  )
})

export default function PixelatedLoading({
  isLoading,
  progress,
  onTransitionComplete,
}: PixelatedLoadingProps) {
  const [visible, setVisible] = useState(true)
  const controls = useAnimation()
  // Use a ref to track if we're in exit animation to avoid unnecessary renders
  const isExiting = useRef(false)
  // Maintain the Canvas reference even during transitions
  const [canvasRendered, setCanvasRendered] = useState(true)

  useEffect(() => {
    if (!isLoading && progress >= 1 && !isExiting.current) {
      // Mark as exiting to prevent re-triggering animations
      isExiting.current = true

      // Start the exit animation
      controls
        .start({
          opacity: 0,
          transition: { duration: 0.8, ease: "easeInOut" }, // Slightly faster transition
        })
        .then(() => {
          setVisible(false)
          // Only remove the Canvas after the animation completes
          setCanvasRendered(false)
          if (onTransitionComplete) {
            onTransitionComplete()
          }
        })
    } else if (isLoading && !isExiting.current) {
      setVisible(true)
      setCanvasRendered(true)
      controls.start({ opacity: 1, transition: { duration: 0.5 } })
    }
  }, [isLoading, progress, controls, onTransitionComplete])

  // Skip rendering completely if not visible
  if (!visible) return null

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: bgColor }}
      initial={{ opacity: 1 }}
      animate={controls}
    >
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div className="w-64 h-64 mb-8">
          {canvasRendered && <ThreeCanvas />}
        </div>
      </div>
    </motion.div>
  )
}
