'use client'

import * as THREE from 'three'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, Decal } from '@react-three/drei'
import { TextureLoader } from 'three'

type OverlayCommon = {
  lat: number
  lon: number
  /** Width/height in world units (radius=1 ⇒ 1 = globe radius). */
  size?: number
  /** Projection depth (Z-scale of the projector box). */
  depth?: number
}

type ImageOverlay = OverlayCommon & {
  type: 'image'
  src: string // e.g. '/overlays/pin.png'
}

type SvgOverlay = OverlayCommon & {
  type: 'svg'
  src: string // e.g. '/overlays/marker.svg'
}

type Overlay = ImageOverlay | SvgOverlay

type Props = {
  /** Path to local earth texture, from /public, default '/textures/earth.jpg' */
  earthTextureSrc?: string
  /** Globe radius */
  radius?: number
  /** Overlays to project */
  overlays?: Overlay[]
}

/** Convert (lat, lon) -> Vector3 on a sphere of radius r. */
function latLonToVector3(latDeg: number, lonDeg: number, r: number) {
  const lat = THREE.MathUtils.degToRad(latDeg)
  const lon = THREE.MathUtils.degToRad(lonDeg)
  const x = r * Math.cos(lat) * Math.cos(lon)
  const y = r * Math.sin(lat)
  const z = r * Math.cos(lat) * Math.sin(lon)
  return new THREE.Vector3(x, y, z)
}

/** Hook: rasterize an SVG file to a CanvasTexture. */
function useSvgTexture(svgPath: string, options?: { size?: number; pixelRatio?: number }) {
  const { size = 1024, pixelRatio = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) } = options || {}
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(svgPath)
        const svgText = await res.text()
        const blob = new Blob([svgText], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = url
        })

        const w = Math.max(size, img.width || size)
        const h = Math.max(size, img.height || size)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(w * pixelRatio)
        canvas.height = Math.round(h * pixelRatio)
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
        ctx.clearRect(0, 0, w, h)

        // preserve aspect ratio and center
        const scale = Math.min(w / (img.width || w), h / (img.height || h))
        const dw = (img.width || w) * scale
        const dh = (img.height || h) * scale
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)

        URL.revokeObjectURL(url)

        const tex = new THREE.CanvasTexture(canvas)
        tex.anisotropy = 8
        tex.colorSpace = THREE.SRGBColorSpace
        tex.needsUpdate = true

        if (!cancelled) setTexture(tex)
      } catch (err) {
        console.error('SVG -> texture failed:', err)
        if (!cancelled) setTexture(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [svgPath, size, pixelRatio])

  return texture
}

/** A single projected overlay (image or svg) at lat/lon. */
function ProjectedOverlay({
  overlay,
  radius = 1,
}: {
  overlay: Overlay
  radius: number
}) {
  const { lat, lon, size = 0.25, depth = 0.5 } = overlay

  // Load texture based on type
  const imageTexture = overlay.type === 'image' ? useLoader(TextureLoader, overlay.src) : null
  const svgTexture = overlay.type === 'svg' ? useSvgTexture(overlay.src, { size: 1024 }) : null
  const tex = overlay.type === 'image' ? imageTexture : svgTexture

  useEffect(() => {
    if (!tex) return
    tex.anisotropy = 8
    ;(tex as any).colorSpace = THREE.SRGBColorSpace
  }, [tex])

  const { pos, rot } = useMemo(() => {
    const surface = latLonToVector3(lat, lon, radius)
    const pos = surface.clone().multiplyScalar(1.02) // just above the surface
    const dir = surface.clone().multiplyScalar(-1).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const m = new THREE.Matrix4().lookAt(pos, pos.clone().add(dir), up)
    const e = new THREE.Euler().setFromRotationMatrix(m)
    return { pos: pos as THREE.Vector3, rot: e as THREE.Euler }
  }, [lat, lon, radius])

  if (!tex) return null

  return (
    <Decal
      position={[pos.x, pos.y, pos.z]}
      rotation={[rot.x, rot.y, rot.z]}
      scale={[size, size, depth]}
      map={tex}
      transparent
      depthTest
      depthWrite={false}
      polygonOffset
      polygonOffsetFactor={-1}
    />
  )
}

function EarthMesh({
  radius = 1,
  earthTextureSrc = '/textures/earth.jpg',
  overlays = [],
}: Required<Pick<Props, 'radius' | 'earthTextureSrc'>> & { overlays: Overlay[] }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const earthMap = useLoader(TextureLoader, earthTextureSrc)
  earthMap.colorSpace = THREE.SRGBColorSpace
  earthMap.anisotropy = 8

  useFrame((_, d) => { meshRef.current.rotation.y += d * 0.15 })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshStandardMaterial map={earthMap} />
      {overlays.map((ov, i) => (
        <ProjectedOverlay key={i} overlay={ov} radius={radius} />
      ))}
    </mesh>
  )
}

export default function ThreeEarthWithOverlays({
  earthTextureSrc = '/textures/earth.jpg',
  radius = 1,
  overlays = [
    // Examples — replace with your data:
    { type: 'image', src: '/overlays/image.png', lat: 37.7749, lon: -122.4194, size: 0.2, depth: 0.4 } as ImageOverlay,
    { type: 'svg', src: '/overlays/image.svg', lat: 47.3769, lon: 8.5417, size: 0.25, depth: 0.45 } as SvgOverlay,
  ],
}: Props) {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [2.2, 1.2, 2.2], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 3, 5]} intensity={2} />
        <EarthMesh radius={radius} earthTextureSrc={earthTextureSrc} overlays={overlays} />
        <OrbitControls enablePan={false} enableZoom />
      </Canvas>
    </div>
  )
}
