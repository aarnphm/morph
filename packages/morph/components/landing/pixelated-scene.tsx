"use client"

import { OrbitControls } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useTime } from "motion/react"
import { degreesToRadians, mix, progress } from "popmotion"
import { forwardRef, memo, useEffect, useLayoutEffect, useRef } from "react"
import * as THREE from "three"

const bgColor = "#f2f0e5"
const wireframeColor = "#111111"

// Reduce rendering complexity with better memoization
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

// Use instanced mesh for stars instead of individual meshes
function Stars({ count = 50 }) {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useRef(new THREE.Object3D())

  useLayoutEffect(() => {
    if (!instancedMeshRef.current) return

    // Position all stars at once
    for (let i = 0; i < count; i++) {
      const distance = mix(2, 3.5, Math.random())
      const yAngle = mix(degreesToRadians(80), degreesToRadians(100), Math.random())
      const xAngle = degreesToRadians(360) * progress(0, count, i)

      dummy.current.position.setFromSphericalCoords(distance, yAngle, xAngle)
      dummy.current.updateMatrix()

      instancedMeshRef.current.setMatrixAt(i, dummy.current.matrix)
    }

    instancedMeshRef.current.instanceMatrix.needsUpdate = true
  }, [count])

  return (
    <instancedMesh ref={instancedMeshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[0.07, 0.07, 0.07]} />
      <meshBasicMaterial wireframe color={wireframeColor} />
    </instancedMesh>
  )
}

function Scene() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const time = useTime()
  const frameRef = useRef<number>(null)

  // Reduce pixel ratio for better performance
  useLayoutEffect(() => {
    gl.setPixelRatio(Math.min(1, window.devicePixelRatio))
    scene.background = new THREE.Color(bgColor)

    // Store reference to current frame for cleanup
    const currentFrameRef = frameRef.current

    return () => {
      if (currentFrameRef) {
        cancelAnimationFrame(currentFrameRef)
      }
    }
  }, [gl, scene])

  // Optimize camera animation with throttling
  useFrame(() => {
    const t = time.get() * 0.0002
    camera.position.setFromSphericalCoords(8, degreesToRadians(75), t)
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      <Icosahedron />
      <Stars count={50} />
    </>
  )
}

// Optimize canvas settings for performance
export default memo(function PixelatedScene() {
  return (
    <Canvas
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        depth: false,
      }}
      dpr={[0.7, 1]} // Limit resolution
      performance={{ min: 0.5 }} // Allow ThreeJS to reduce quality if needed
      style={{ height: "100%", width: "100%" }}
    >
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
