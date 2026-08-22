"use client";

import dynamic from 'next/dynamic';

const EstadisticasSection = dynamic(
  () => import('./EstadisticasSection'),
  { 
    ssr: false,
    loading: () => <div className="bg-surface border border-line rounded-lg shadow p-4 h-64 animate-pulse" />
  }
);

export default function EstadisticasWrapper() {
  return <EstadisticasSection />;
}