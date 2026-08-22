import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: {
    // Ignorar advertencias durante el build en Vercel
    ignoreDuringBuilds: true,
  },
  // Hay un package-lock.json suelto en ~/, y Next infiere mal la raíz del
  // workspace. Fijamos la raíz a este proyecto para silenciar el warning.
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    // Tree-shaking agresivo de paquetes con barriles gigantes:
    // menos JS en el bundle inicial del dashboard.
    optimizePackageImports: ['@heroicons/react', 'recharts', 'date-fns'],
  },
};

export default nextConfig;
