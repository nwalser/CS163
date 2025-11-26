"use client";

import { useMemo, useState } from "react";
import ThreeEarthWithNSIDCOverlay from "./_components/Earth2";

// ------------------------------------------------------
// 1. Generate all YYYYMMDD values from 1980 → 2022
// ------------------------------------------------------
const start = new Date(1980, 0, 1); // Jan 1, 1980
const end = new Date(2022, 11, 31); // Dec 31, 2022

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

  const overlay = useMemo(
    () => ({
      src: `/sea-ice-extent/${year}/${month}/${filename}.png`,
      extentMeters: [-3850000, -5350000, 3750000, 5850000],
      projection: "north" as const,
      outWidth: 4096,
    }),
    [filename],
  );

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-gray-900 gap-6">
      {/* Display current date */}
      <div className="text-gray-100 text-lg font-semibold">
        Arctic sea ice – {day}.{month}.
        <span className="text-cyan-300">{year}</span>
      </div>

      {/* Earth */}
      <ThreeEarthWithNSIDCOverlay
        overlay={overlay}
        earthTextureSrc="/textures/earth.jpg"
        radius={1}
      />

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
