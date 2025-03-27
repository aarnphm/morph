"use client"

import { useRef, useLayoutEffect } from "react"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { useTime } from "motion/react"
import { degreesToRadians, mix, progress } from "popmotion"
import type * as THREE from "three"

const color = "#111111"

// Icosahedron component
function Icosahedron() {
  return (
    <mesh rotation-x={0.35}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial wireframe color={color} />
    </mesh>
  )
}

// Star component
function Star({ p }: { p: number }) {
  const ref = useRef<THREE.Object3D>(null)

  useLayoutEffect(() => {
    if (!ref.current) return

    const distance = mix(2, 3.5, Math.random())
    const yAngle = mix(degreesToRadians(80), degreesToRadians(100), Math.random())
    const xAngle = degreesToRadians(360) * p
    ref.current.position.setFromSphericalCoords(distance, yAngle, xAngle)
  }, [p])

  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.05, 0.05, 0.05]} />
      <meshBasicMaterial wireframe color={color} />
    </mesh>
  )
}

function Scene({ numStars = 100 }) {
  const gl = useThree((state) => state.gl)
  const time = useTime()

  // Set low pixel ratio for pixelated effect
  useLayoutEffect(() => {
    gl.setPixelRatio(0.3)
  }, [gl])

  // Gentle auto-rotation
  useFrame(({ camera }) => {
    camera.position.setFromSphericalCoords(5, degreesToRadians(75), time.get() * 0.0002)
    camera.lookAt(0, 0, 0)
  })

  // Generate stars
  const stars = []
  for (let i = 0; i < numStars; i++) {
    stars.push(<Star key={i} p={progress(0, numStars, i)} />)
  }

  return (
    <>
      <Icosahedron />
      {stars}
    </>
  )
}

export default function PixelatedScene() {
  return (
    <Canvas gl={{ antialias: false }}>
      <Scene />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.5}
      />
    </Canvas>
  )
}
