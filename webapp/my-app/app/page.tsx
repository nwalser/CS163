"use client";

import { useState } from "react";
import { Earth } from "./_components/Earth2";
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

const start = new Date(1980, 0, 1);
const end = new Date(2022, 11, 31);

function generateDateList() {
  const list: string[] = [];
  let current = new Date(start);

  while (current <= end) {
    const y = current.getFullYear().toString();
    const m = (current.getMonth() + 1).toString().padStart(2, "0");
    const d = current.getDate().toString().padStart(2, "0");
    list.push(`${y}${m}${d}`); // YYYYMMDD
    current.setDate(current.getDate() + 1);
  }

  return list;
}

const allDates = generateDateList();
const MAX_INDEX = allDates.length - 1;

export default function Home() {
  const [index, setIndex] = useState(0);

  const filename = allDates[index];
  const year = filename.slice(0, 4);
  const month = filename.slice(4, 6);
  const day = filename.slice(6, 8);

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-gray-900 gap-6">
      {/* Display current date */}
      <div className="text-gray-100 text-lg font-semibold">
        Arctic sea ice – {day}.{month}.
        <span className="text-cyan-300">{year}</span>
      </div>

      {/* Earth */}
      <div className="w-full h-full">
        <Canvas camera={{ position: [2.2, 1.1, 2.2], fov: 45 }}>
          <ambientLight intensity={2} />
          <group>
            <Earth radius={1} baseTextureSrc={`/textures/earth.jpg`} />
            <Earth radius={1.001} baseTextureSrc={`/sea-ice-extent-texture/${year}/${month}/${filename}.png`} />
          </group>
          <OrbitControls enablePan={false} enableZoom />
        </Canvas>
      </div>


      {/* Slider: 1 day per step */}
      <div className="w-full max-w-2xl px-8">
        <input
          type="range"
          min={0}
          max={MAX_INDEX}
          value={index}
          onChange={(e) => setIndex(parseInt(e.target.value, 10))}
          className="w-full"
        />

        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>1980-01-01</span>
          <span>2022-12-31</span>
        </div>
      </div>
    </main>
  );
}