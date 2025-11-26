'use client'

import * as THREE from 'three'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import proj4 from 'proj4'

/**
 * EPSG defs for NSIDC polar stereographic
 * North (EPSG:3413): lat_ts=70, lon_0=-45
 * South (EPSG:3031): lat_ts=-71, lon_0=0
 */
const EPSG_3411 =
  '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +k=1 +x_0=0 +y_0=0 +a=6378273 +b=6356889.449 +units=m +no_defs'
const EPSG_3031 =
  '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'

type NSIDCProjection = 'north' | 'south'

export type OverlayConfig = {
  /** URL of your NSIDC-projected raster (PNG/JPG with transparency if you want blending) */
  src: string
  /** Projected extent of the image in METERS: [xmin, ymin, xmax, ymax] in EPSG:3413/3031 coordinates */
  extentMeters: [number, number, number, number]
  /** Hemisphere / projection */
  projection: NSIDCProjection
  /**
   * Output texture resolution for reprojection (width). Height is computed automatically.
   * Larger = crisper overlay but more CPU. 2048–4096 is usually plenty.
   */
  outWidth?: number
}

function useImage(url: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    let canceled = false
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => !canceled && setImg(i)
    i.onerror = () => !canceled && setImg(null)
    i.src = url
    return () => {
      canceled = true
    }
  }, [url])

  return img
}

/**
 * Reproject a polar stereographic image (EPSG:3413/3031) onto an equirectangular canvas (lon/lat).
 * We inverse-map per target pixel:
 *   (u,v) -> lon/lat -> project to (x,y) in polar stereo -> sample source image.
 */
function useNSIDCOverlayTexture({
  src,
  extentMeters,
  projection,
  outWidth = 2048,
}: OverlayConfig) {
  const img = useImage(src)
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    if (!img) return

    // Setup proj4 transforms
    const from4326toPolar = proj4(
      'EPSG:4326',
      projection === 'north' ? EPSG_3411 : EPSG_3031,
    )

    // Build a source canvas for fast pixel reads
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = img.naturalWidth
    srcCanvas.height = img.naturalHeight
    const sctx = srcCanvas.getContext('2d', { willReadFrequently: true })!
    sctx.drawImage(img, 0, 0)
    const srcData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)

    // Target canvas (equirectangular)
    const aspect = 0.5 // 360x180 deg → H = W/2
    const dstW = outWidth
    const dstH = Math.round(outWidth * aspect)
    const dstCanvas = document.createElement('canvas')
    dstCanvas.width = dstW
    dstCanvas.height = dstH
    const dctx = dstCanvas.getContext('2d')!
    const dstImg = dctx.createImageData(dstW, dstH)

    const [xmin, ymin, xmax, ymax] = extentMeters
    const srcW = srcCanvas.width
    const srcH = srcCanvas.height

    // Helper: bilinear sample from source imageData at floating-point pixel coords
    function sampleSrc(u: number, v: number) {
      // u in [0,1], v in [0,1] over the projected extent
      const xMeters = xmin + u * (xmax - xmin)
      const yMeters = ymin + v * (ymax - ymin)

      // map meters to source pixel coords (assuming full extent spans the image)
      const sx = ((xMeters - xmin) / (xmax - xmin)) * (srcW - 1)
      const sy =
        (1 - (yMeters - ymin) / (ymax - ymin)) * (srcH - 1) // y downwards in image

      // bilinear
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy)
      const x1 = Math.min(x0 + 1, srcW - 1),
        y1 = Math.min(y0 + 1, srcH - 1)
      const tx = sx - x0,
        ty = sy - y0
      const idx = (x: number, y: number) => 4 * (y * srcW + x)

      const c00 = idx(x0, y0),
        c10 = idx(x1, y0),
        c01 = idx(x0, y1),
        c11 = idx(x1, y1)
      const out = [0, 0, 0, 0]
      for (let k = 0; k < 4; k++) {
        const v00 = srcData.data[c00 + k]
        const v10 = srcData.data[c10 + k]
        const v01 = srcData.data[c01 + k]
        const v11 = srcData.data[c11 + k]
        const v0 = v00 * (1 - tx) + v10 * tx
        const v1 = v01 * (1 - tx) + v11 * tx
        out[k] = v0 * (1 - ty) + v1 * ty
      }
      return out as [number, number, number, number]
    }

    // For each output lon/lat pixel, find where it lies in the projected image
    // Equirectangular: x→lon in [-180,180], y→lat in [90,-90]
    const data = dstImg.data
    let ptr = 0
    for (let y = 0; y < dstH; y++) {
      const lat = 90 - (y / (dstH - 1)) * 180
      for (let x = 0; x < dstW; x++) {
        const lon = -180 + (x / (dstW - 1)) * 360

        // Forward-project lon/lat to polar stereographic meters
        const [xm, ym] = from4326toPolar.forward([lon, lat])

        // Normalize into [0,1] across the provided image extent
        const u = (xm - xmin) / (xmax - xmin)
        const v = (ym - ymin) / (ymax - ymin)

        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          const [r, g, b, a] = sampleSrc(u, v)
          data[ptr++] = r
          data[ptr++] = g
          data[ptr++] = b
          data[ptr++] = a
        } else {
          // Transparent outside the raster footprint
          data[ptr++] = 0
          data[ptr++] = 0
          data[ptr++] = 0
          data[ptr++] = 0
        }
      }
    }

    dctx.putImageData(dstImg, 0, 0)
    const texture = new THREE.CanvasTexture(dstCanvas)
    texture.anisotropy = 8
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    setTex(texture)

    return () => {
      texture.dispose()
    }
  }, [img, extentMeters, projection, src, outWidth])

  return tex
}

/**
 * Earth globe — memoized so it doesn’t “reload” when overlay props change.
 */
const Earth: React.FC<{
  radius?: number
  baseTextureSrc?: string
}> = React.memo(function Earth({
  radius = 1,
  baseTextureSrc = '/textures/earth.jpg',
}) {
  const meshRef = useRef<THREE.Mesh>(null!)

  const baseMap = useMemo(() => {
    const loader = new THREE.TextureLoader()
    const tex = loader.load(baseTextureSrc)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [baseTextureSrc])

  // useFrame((_, d) => { meshRef.current.rotation.y += d * 0.15 })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 96, 96]} />
      <meshStandardMaterial map={baseMap} />
    </mesh>
  )
})

function OverlaySphere({
  radius = 1.001, // tiny offset to avoid z-fighting
  texture,
}: {
  radius?: number
  texture: THREE.Texture | null
}) {
  if (!texture) return null
  return (
    <mesh>
      <sphereGeometry args={[radius, 96, 96]} />
      {/* Basic, unlit material so overlay colors are not altered by lights */}
      <meshBasicMaterial map={texture} transparent opacity={1} />
    </mesh>
  )
}

export default function ThreeEarthWithNSIDCOverlay({
  // EXAMPLE defaults – replace with your own
  overlay = {
    src: '/overlays/nsidc_north.png',
    // <- extent in meters matching your image (EPSG:3413)
    extentMeters: [-3850000, -5350000, 3750000, 5850000],
    projection: 'north' as NSIDCProjection,
    outWidth: 3072,
  },
  earthTextureSrc = '/textures/earth.jpg',
  radius = 1,
}: {
  overlay?: OverlayConfig
  earthTextureSrc?: string
  radius?: number
}) {
  // Only this texture is recomputed when `overlay` changes (e.g. slider changes src)
  const reprojTex = useNSIDCOverlayTexture(overlay)

  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [2.2, 1.1, 2.2], fov: 45 }}>
        <ambientLight intensity={2} />
        <group>
          <Earth radius={radius} baseTextureSrc={earthTextureSrc} />
          <OverlaySphere radius={radius * 1.001} texture={reprojTex ?? null} />
        </group>
        <OrbitControls enablePan={false} enableZoom />
      </Canvas>
    </div>
  )
}
