// frontend/components/StatusBar.tsx
"use client";

export default function StatusBar({
  api,
  apiErr,
  cvReady
}: {
  api: { ok: boolean; service: string; version: string } | null;
  apiErr: string | null;
  cvReady: boolean;
}) {
  return (
    <div style={{
      display: "flex", gap: 16, alignItems: "center",
      padding: 12, borderBottom: "1px solid #eee"
    }}>
      <span style={pill()}>Frontend: Next.js + TS + Konva</span>
      <span style={pill(api?.ok ? "ok" : apiErr ? "err" : undefined)}>
        API: {api?.ok ? `OK v${api.version}` : apiErr ? "ERROR" : "…"}
      </span>
      <span style={pill(cvReady ? "ok" : undefined)}>
        OpenCV.js: {cvReady ? "ready" : "loading…"}
      </span>
    </div>
  );
}

function pill(kind?: "ok" | "err") {
  const base = {
    padding: "4px 10px",
    borderRadius: 999,
    background: "#f2f2f2"
  } as React.CSSProperties;
  if (kind === "ok") return { ...base, background: "#e6ffed" };
  if (kind === "err") return { ...base, background: "#ffe6e6" };
  return base;
}
