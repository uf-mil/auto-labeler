from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psycopg
from fastapi.responses import StreamingResponse
from psycopg.rows import dict_row

conn = psycopg.connect(
    host=os.getenv("DB_HOST", "db"),
    port=os.getenv("DB_PORT", "5432"),
    dbname=os.getenv("DB_NAME", "labeler"),
    user=os.getenv("DB_USER", "labeler"),
    password=os.getenv("DB_PASSWORD", "labeler"),
    autocommit=True
)

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

@app.get("/api/projects")
def list_projects():
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT 
                    p.id,
                    p.name,
                    p.created_at,
                    COUNT(DISTINCT i.id) AS total_images,
                    COUNT(DISTINCT CASE WHEN a.state = 'submitted' THEN a.id END) AS labeled_count,
                    MAX(a.submitted_at) AS last_labeled_at
                FROM projects p
                LEFT JOIN images i ON i.project_id = p.id
                LEFT JOIN annotation_sets a ON a.image_id = i.id
                GROUP BY p.id
                ORDER BY p.id;
            """)
            rows = cur.fetchall()

        if not rows:
            return []

        projects = []
        for row in rows:
            projects.append({
                "id": row["id"],
                "name": row["name"],
                "description": None,  # can extend schema later
                "totalImages": row["total_images"],
                "labeledCount": row["labeled_count"],
                "lastLabeledAt": (
                    row["last_labeled_at"].isoformat() if row["last_labeled_at"] else None
                ),
                "createdAt": (
                    row["created_at"].isoformat() if row["created_at"] else None
                )
            })

        return projects

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {e}")