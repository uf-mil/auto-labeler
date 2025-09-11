from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

#instance
app = FastAPI(title = "AutoLabeler API", version = "0.0.1")

# Allow contact with api through browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], #tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Run func when 
@app.get("/api/health")
def health():
    return {"ok": True, "service": "api", "version": "0.0.1"}
