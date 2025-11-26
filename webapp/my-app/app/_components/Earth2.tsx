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

export type NSIDCProjection = 'north' | 'south'

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

const proj4326ToNorth = proj4('EPSG:4326', EPSG_3411)
const proj4326ToSouth = proj4('EPSG:4326', EPSG_3031)

/**
 * Reproject a polar stereographic image (EPSG:3413/3031) onto an equirectangular canvas (lon/lat).
 * We inverse-map per target pixel:
 *   (u,v) -> lon/lat -> project to (x,y) in polar stereo -> sample source image.
 */
export function useNSIDCOverlayTexture({
  src,
  extentMeters,
  projection,
  outWidth = 2048,
}: OverlayConfig) {
  const img = useImage(src)
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    if (!img) return

    const from4326toPolar =
      projection === 'north' ? proj4326ToNorth : proj4326ToSouth

    // ---- Build source canvas once per effect ----
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = img.naturalWidth
    srcCanvas.height = img.naturalHeight
    const sctx = srcCanvas.getContext('2d', { willReadFrequently: true })!
    sctx.drawImage(img, 0, 0)
    const srcData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)
    const src = srcData.data
    const srcW = srcCanvas.width
    const srcH = srcCanvas.height

    // ---- Target canvas (equirectangular) ----
    const aspect = 0.5 // 360x180 deg → H = W/2
    const dstW = outWidth
    const dstH = Math.round(outWidth * aspect)
    const dstCanvas = document.createElement('canvas')
    dstCanvas.width = dstW
    dstCanvas.height = dstH
    const dctx = dstCanvas.getContext('2d')!
    const dstImg = dctx.createImageData(dstW, dstH)
    const dst = dstImg.data

    const [xmin, ymin, xmax, ymax] = extentMeters
    const dx = xmax - xmin
    const dy = ymax - ymin
    const invDx = 1 / dx
    const invDy = 1 / dy

    // ---- Precompute lon/lat for each column/row ----
    const lonPerX = new Float32Array(dstW)
    const latPerY = new Float32Array(dstH)

    const invWm1 = 1 / (dstW - 1)
    const invHm1 = 1 / (dstH - 1)

    for (let x = 0; x < dstW; x++) {
      lonPerX[x] = -180 + x * invWm1 * 360
    }
    for (let y = 0; y < dstH; y++) {
      latPerY[y] = 90 - y * invHm1 * 180
    }

    // ---- Main reprojection loop (no allocations, inlined sampling) ----
    let ptr = 0

    for (let y = 0; y < dstH; y++) {
      const lat = latPerY[y]

      for (let x = 0; x < dstW; x++) {
        const lon = lonPerX[x]

        // Forward-project lon/lat to polar stereographic meters
        const [xm, ym] = from4326toPolar.forward([lon, lat])

        // Normalize into [0,1] across the provided image extent
        const u = (xm - xmin) * invDx
        const v = (ym - ymin) * invDy

        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          // Map normalized coords → source pixel coords
          const sx = u * (srcW - 1)
          const sy = (1 - v) * (srcH - 1) // y downwards in image

          const x0 = sx | 0 // faster floor
          const y0 = sy | 0
          const x1 = x0 + 1 < srcW ? x0 + 1 : srcW - 1
          const y1 = y0 + 1 < srcH ? y0 + 1 : srcH - 1

          const tx = sx - x0
          const ty = sy - y0

          const row0 = y0 * srcW
          const row1 = y1 * srcW

          const idx00 = 4 * (row0 + x0)
          const idx10 = 4 * (row0 + x1)
          const idx01 = 4 * (row1 + x0)
          const idx11 = 4 * (row1 + x1)

          // Bilinear interpolation, channel-wise
          for (let k = 0; k < 4; k++) {
            const v00 = src[idx00 + k]
            const v10 = src[idx10 + k]
            const v01 = src[idx01 + k]
            const v11 = src[idx11 + k]

            const v0 = v00 + (v10 - v00) * tx
            const v1 = v01 + (v11 - v01) * tx
            dst[ptr++] = v0 + (v1 - v0) * ty
          }
        } else {
          // Transparent outside the raster footprint
          dst[ptr++] = 0
          dst[ptr++] = 0
          dst[ptr++] = 0
          dst[ptr++] = 0
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
export const Earth: React.FC<{
  radius?: number
  baseTextureSrc?: string
}> = React.memo(function Earth({
  radius = 1,
  baseTextureSrc = '/textures/earth.png', // PNG with alpha
}) {
  const meshRef = useRef<THREE.Mesh>(null!)

  const baseMap = useMemo(() => {
    const loader = new THREE.TextureLoader()
    const tex = loader.load(baseTextureSrc)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }, [baseTextureSrc])

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 96, 96]} />
      <meshStandardMaterial
        map={baseMap}
        transparent
        alphaTest={0.01}
      />
    </mesh>
  )
})


export function OverlaySphere({
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