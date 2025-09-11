// frontend/components/CanvasStage.tsx
"use client";
import { useEffect, useState } from "react";
import { Stage, Layer, Rect, Text } from "react-konva";

export default function CanvasStage() {
  // Don’t render Stage until mounted (avoids SSR/rehydration edge cases)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Stage width={900} height={520} style={{ border: "1px solid #ddd", margin: 12 }}>
      <Layer>
        <Text text="Konva Canvas" x={16} y={12} fontSize={18} />
        <Rect x={80} y={80} width={250} height={160} stroke="black" dash={[6, 4]} />
        <Rect x={380} y={160} width={120} height={120} fill="#eef" />
      </Layer>
    </Stage>
  );
}
