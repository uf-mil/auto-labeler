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
    const [testImageUrl, setTestImageUrl] = useState<string>("");
  
    useEffect(() => {
      ping().then(setApi).catch((e) => setApiErr(String(e)));
      //testing without backend
      //setApi({ ok: true, service: "mock", version: "0.0.1" });
    }, []);
  
    // When OpenCV script loads, cv becomes available on window
    const onCvReady = () => {
      
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
          <h2 className="text-xl font-bold mb-2">AutoLabeler - Draw around objects to automatically create annotations</h2>
          <p className="mb-4">
            {cvReady ? "Edge detection is ready!" : "Loading OpenCV"}
          </p>

          {/* Image URL Input */}
          <div className="bg-gray-100 p-4 rounded-lg mb-4 flex gap-2 items-center">
            <label className="font-semibold">Test Image URL:</label>
            <input
              type="text"
              value={testImageUrl}
              onChange={(e) => setTestImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg or leave blank to test drawing"
              className="flex-1 px-3 py-2 rounded border"
            />
            <button
              onClick={() => setTestImageUrl("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/481px-Cat03.jpg")}
              className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Load Sample
            </button>
          </div>
        </div>
        <CanvasStage
          cvReady={cvReady}
          imageUrl={testImageUrl || undefined}
        />
      </>
    );
}