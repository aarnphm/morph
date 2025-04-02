"use client"

import { Icosahedron } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { motion, useAnimation } from "motion/react"
import { useEffect, useRef, useState } from "react"
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

export default function PixelatedLoading({
  isLoading,
  progress,
  onTransitionComplete,
}: PixelatedLoadingProps) {
  const [visible, setVisible] = useState(true)
  const controls = useAnimation()

  useEffect(() => {
    if (!isLoading && progress >= 1) {
      // Start the exit animation
      controls
        .start({
          opacity: 0,
          transition: { duration: 1.2, ease: "easeInOut" },
        })
        .then(() => {
          setVisible(false)
          if (onTransitionComplete) {
            onTransitionComplete()
          }
        })
    } else if (isLoading) {
      setVisible(true)
      controls.start({ opacity: 1, transition: { duration: 0.5 } })
    }
  }, [isLoading, progress, controls, onTransitionComplete])

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
          <Canvas gl={{ antialias: false }}>
            <ambientLight intensity={0.5} />
            <LoadingIcosahedron />
          </Canvas>
        </div>
      </div>
    </motion.div>
  )
}
