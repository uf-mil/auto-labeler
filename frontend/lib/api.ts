// frontend/lib/api.ts
export async function ping() {
    const r = await fetch("http://localhost:8000/api/health", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  