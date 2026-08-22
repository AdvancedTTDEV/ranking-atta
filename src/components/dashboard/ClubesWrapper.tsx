"use client";

import dynamic from 'next/dynamic';

const ClubesSection = dynamic(
  () => import('./ClubesSection'),
  { 
    ssr: false,
    loading: () => <div className="bg-surface border border-line rounded-lg shadow p-4 h-64 animate-pulse" />
  }
);

export default function ClubesWrapper() {
  return <ClubesSection />;
}