'use client';

import dynamic from 'next/dynamic';
import * as THREE from 'three';
import { useEffect, useMemo, useState } from 'react';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

export default function GlobeWithSpritePin() {
  const [spriteMat, setSpriteMat] = useState<THREE.SpriteMaterial | null>(null);

  // 1) Load the texture/material on the client only
  useEffect(() => {
    let isCancelled = false;

    const loader = new THREE.TextureLoader();
    loader.load('/pin.png', (tex) => {
      if (isCancelled) return;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      setSpriteMat(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  // 2) Your markers
  const objects = useMemo(
    () => [{ lat: 48.8584, lng: 2.2945, name: 'Paris' }],
    []
  );

  return (
    <div style={{ width: '100%', height: 600 }}>
      <Globe
        globeImageUrl="https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg"

        // Only pass objects once the sprite material exists
        objectsData={spriteMat ? objects : []}
        objectLat="lat"
        objectLng="lng"
        objectAltitude={0.01}
        objectFacesSurface={false}
        objectLabel="name"
        objectThreeObject={() => {
          // This function will only run if objectsData is non-empty
          const sprite = new THREE.Sprite(spriteMat!);
          sprite.scale.set(0.08, 0.08, 1); // tune on-screen size
          return sprite;
        }}
      />
    </div>
  );
}
