"use client"

import { useEffect, useRef, useState, memo } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { motion } from "motion/react"
import * as THREE from "three"

// Color palette
const COLORS = {
  lightCyan: "#d6fff6",
  mediumTurquoise: "#4dccbd",
  russianViolet: "#110d31",
  frenchBlue: "#2374ab",
  lightCoral: "#f2f0e5",
}

// Cube component with pixelated look
function PixelatedCube({ progress }: { progress: number }) {
  const cubeRef = useRef<THREE.Group>(null)
  const shadowRef = useRef<THREE.Mesh>(null)

  // Animation timing
  const ANIMATION_DURATION = 2

  useFrame(({ clock }) => {
    if (!cubeRef.current || !shadowRef.current) return

    const time = clock.getElapsedTime()
    const bounceProgress = Math.sin((time * Math.PI) / ANIMATION_DURATION)

    // Rotation animation
    cubeRef.current.rotation.x = Math.PI / 4
    cubeRef.current.rotation.z = Math.PI / 4 + (time * Math.PI) / ANIMATION_DURATION

    // Bouncing animation
    cubeRef.current.position.y = Math.abs(bounceProgress) * 0.5

    // Shadow animation
    shadowRef.current.scale.setScalar(1.3 - Math.abs(bounceProgress) * 0.3)
    if (shadowRef.current.material instanceof THREE.Material) {
      shadowRef.current.material.opacity = 0.05 + Math.abs(bounceProgress) * 0.25
    }
  })

  return (
    <group>
      {/* Shadow plane */}
      <mesh ref={shadowRef} rotation-x={-Math.PI / 2} position-y={-0.5}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={COLORS.russianViolet} transparent opacity={0.2} />
      </mesh>

      {/* Cube */}
      <group ref={cubeRef}>
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={COLORS.russianViolet} wireframe />
        </mesh>

        {/* Cube faces */}
        <mesh position={[0, 0, 0.501]}>
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial color={COLORS.russianViolet} />
        </mesh>
        <mesh position={[0, 0, -0.501]} rotation-y={Math.PI}>
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial color={COLORS.russianViolet} />
        </mesh>
        <mesh position={[0.501, 0, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial color={COLORS.russianViolet} />
        </mesh>
        <mesh position={[-0.501, 0, 0]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial color={COLORS.russianViolet} />
        </mesh>
        <mesh position={[0, 0.501, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial color={COLORS.russianViolet} />
        </mesh>
        <mesh position={[0, -0.501, 0]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial color={COLORS.russianViolet} />
        </mesh>
      </group>

      {/* Progress bar (optional) */}
      {progress < 1 && (
        <group position={[0, -1.2, 0]}>
          <mesh position={[0, 0, -0.1]}>
            <boxGeometry args={[2, 0.2, 0.05]} />
            <meshBasicMaterial color={COLORS.russianViolet} opacity={0.3} transparent />
          </mesh>
          <mesh position={[-1 + progress, 0, 0]} scale={[progress * 2, 0.15, 0.1]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={COLORS.mediumTurquoise} />
          </mesh>
        </group>
      )}
    </group>
  )
}

// Scene with pixelated stars
function PixelatedScene({ progress }: { progress: number }) {
  const starsRef = useRef<THREE.Group>(null)

  useEffect(() => {
    if (!starsRef.current) return

    // Create pixelated stars
    for (let i = 0; i < 30; i++) {
      const star = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.07),
        new THREE.MeshBasicMaterial({
          color: COLORS.russianViolet,
          wireframe: true,
        }),
      )

      // Random position in a sphere
      const distance = 2.5 + Math.random() * 1.5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)

      star.position.x = distance * Math.sin(phi) * Math.cos(theta)
      star.position.y = distance * Math.sin(phi) * Math.sin(theta)
      star.position.z = distance * Math.cos(phi)

      starsRef.current.add(star)
    }
  }, [])

  useFrame(({ clock }) => {
    if (!starsRef.current) return

    // Rotate stars slowly
    starsRef.current.rotation.y = clock.getElapsedTime() * 0.1
  })

  return (
    <group>
      <group ref={starsRef} />
      <PixelatedCube progress={progress} />
    </group>
  )
}

// Main loading screen component
export default memo(function PixelatedLoadingScreen({
  isLoading,
  progress = 0,
}: {
  isLoading: boolean
  progress: number
}) {
  // Use the passed progress directly
  const showScreen = progress < 1

  // Immediately return null if progress is 1 or more, allowing parent to unmount
  if (!showScreen) return null

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: COLORS.lightCoral }}
      initial={{ opacity: 0 }}
      // Animate opacity based on whether the screen should be shown
      animate={{ opacity: showScreen ? 1 : 0 }}
      exit={{ opacity: 0 }}
      // Adjust transition for potentially smoother exit if needed
      transition={{ duration: 0.5 }} // Example: slightly longer fade-out
    >
      <div className="w-64 h-64 relative">
        <Canvas gl={{ antialias: false, pixelRatio: 0.5 }}>
          <PixelatedScene progress={progress} />
        </Canvas>
      </div>
    </motion.div>
  )
})
