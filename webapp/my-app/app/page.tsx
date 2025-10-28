import Image from "next/image";
import GlobePage from "./_components/Globe";
import Earth from "./_components/Earth";
import Test from "./_components/Test";
import { TessellateModifier } from "three/examples/jsm/Addons.js";

export default function Home() {
  return (
    <main className="flex items-center justify-center h-screen bg-gray-900">
      <Earth />
    </main>
  );
}
