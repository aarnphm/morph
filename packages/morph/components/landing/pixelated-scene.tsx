"use client"

import { OrbitControls } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useTime } from "motion/react"
import { degreesToRadians, mix, progress } from "popmotion"
import { forwardRef, memo, useEffect, useLayoutEffect, useRef } from "react"
import * as THREE from "three"

const bgColor = "#f2f0e5"
const wireframeColor = "#111111"

const Icosahedron = memo(
  forwardRef<THREE.Mesh>(function Icosahedron(_, ref) {
    const meshRef = useRef<THREE.Mesh>(null)

    useEffect(() => {
      if (!ref) return
      if (typeof ref === "function") {
        ref(meshRef.current)
      } else {
        ref.current = meshRef.current
      }
    }, [ref])

    return (
      <mesh ref={meshRef} rotation-x={0.35}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial wireframe color={wireframeColor} />
      </mesh>
    )
  }),
)

// Star component
function Star({ p }: { p: number }) {
  const ref = useRef<THREE.Mesh>(null)

  useLayoutEffect(() => {
    if (!ref.current) return

    const distance = mix(2, 3.5, Math.random())
    const yAngle = mix(degreesToRadians(80), degreesToRadians(100), Math.random())
    const xAngle = degreesToRadians(360) * p
    ref.current.position.setFromSphericalCoords(distance, yAngle, xAngle)
  }, [p])

  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.07, 0.07, 0.07]} />
      <meshBasicMaterial wireframe color={wireframeColor} />
    </mesh>
  )
}

function Scene({ numStars = 100 }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const time = useTime()

  useLayoutEffect(() => {
    gl.setPixelRatio(1)
    scene.background = new THREE.Color(bgColor)
  }, [gl, scene])

  useFrame(({ camera }) => {
    camera.position.setFromSphericalCoords(8, degreesToRadians(75), time.get() * 0.0002)
    camera.lookAt(0, 0, 0)
  })

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

export default memo(function PixelatedScene() {
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
})
