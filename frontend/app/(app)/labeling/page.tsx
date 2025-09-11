"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import StatusBar from "@/components/StatusBar";
import CanvasStage from "@/components/CanvasStage";
import { ping } from "@/lib/api";

type Health = { ok: boolean; service: string; version: string };

export default function Page() {
    const [api, setApi] = useState<Health | null>(null);
    const [apiErr, setApiErr] = useState<string | null>(null);
    const [cvReady, setCvReady] = useState(false);
  
    useEffect(() => {
      ping().then(setApi).catch((e) => setApiErr(String(e)));
      //testing without backend
      //setApi({ ok: true, service: "mock", version: "0.0.1" });
    }, []);
  
    // When OpenCV script loads, cv becomes available on window
    const onCvReady = () => {
      // @ts-ignore
      const ok = typeof window.cv !== "undefined";
      setCvReady(ok);
    };
  
    return (
      <>
        <Script
          src="https://docs.opencv.org/4.x/opencv.js"
          strategy="afterInteractive"
          onLoad={onCvReady}
        />
        <StatusBar api={api} apiErr={apiErr} cvReady={cvReady} />
        <div style={{ padding: 12 }}>
          <p>
            Next.js app is running. Konva canvas below confirms rendering.
            OpenCV.js loaded client-side. Backend health checked via fetch.
          </p>
        </div>
        <CanvasStage />
      </>
    );
}