import ThreeEarthWithNSIDCOverlay from "./_components/Earth2";

export default function Home() {
  return (
    <main className="flex items-center justify-center h-screen bg-gray-900">
      <ThreeEarthWithNSIDCOverlay
        overlay={{
          src: '/overlays/age5.png',
          extentMeters: [-3850000, -5350000, 3750000, 5850000], // <- replace with yours
          projection: 'north',
          outWidth: 4096,
        }}
        earthTextureSrc="/textures/earth.jpg"
        radius={1}
      />
    </main>
  );
}
