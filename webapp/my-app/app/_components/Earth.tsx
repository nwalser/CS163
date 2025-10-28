'use client'

import * as THREE from 'three'
import React, { useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { TextureLoader } from 'three'

function Earth() {
  const meshRef = useRef<THREE.Mesh>(null!)
  // Load your local texture from the public folder
  const earthTexture = useLoader(TextureLoader, '/textures/earth.jpg')

  // Slowly rotate the Earth
  useFrame((_, delta) => {
    meshRef.current.rotation.y += delta * 0.15
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial map={earthTexture} />
    </mesh>
  )
}

export default function ThreeEarthScene() {
  return (
    <div className="w-full h-[500px]">
      <Canvas camera={{ position: [2, 0, 2], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 3, 5]} intensity={2} />
        <Earth />
        <OrbitControls enablePan={false} enableZoom={true} />
      </Canvas>
    </div>
  )
}
