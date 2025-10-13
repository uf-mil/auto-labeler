import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File, Form, Query
from pydantic import BaseModel
from typing import Optional
import psycopg

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

@app.get("/api/health")
def health():
    return {"ok": True, "service": "api", "version": "0.0.1"}

class ImageCreate(BaseModel):
    project_id: int
    uri: str
    width: int | None = None
    height: int | None = None

class ImageUpdate(BaseModel):
    uri: str | None = None
    width: int | None = None
    height: int | None = None

# Create image
@app.post("/api/images")
async def create_image(
    project_id: int = Form(...),
    file: UploadFile = File(...)
):
    content = await file.read()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO images (project_id, uri, width, height, image_data)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, project_id, uri, width, height, created_at, last_annotated_at, last_annotated_by_user;
            """,
            (project_id, file.filename, None, None, psycopg.Binary(content))
        )
        row = cur.fetchone()
    return dict(
        id=row[0],
        project_id=row[1],
        uri=row[2],
        width=row[3],
        height=row[4],
        created_at=row[5],
        last_annotated_at=row[6],
        last_annotated_by_user=row[7],
    )

#List images
@app.get("/api/images")
def list_images(project_id: Optional[int] = Query(None)):
    with conn.cursor() as cur:
        if project_id is not None:
            cur.execute(
                """
                SELECT id, project_id, uri, width, height, created_at, last_annotated_at, last_annotated_by_user
                FROM images
                WHERE project_id = %s
                ORDER BY id
                """,
                (project_id,)
            )
        else:
            cur.execute(
                """
                SELECT id, project_id, uri, width, height, created_at, last_annotated_at, last_annotated_by_user
                FROM images
                ORDER BY id
                """
            )
        rows = cur.fetchall()
    return [
        dict(
            id=r[0],
            project_id=r[1],
            uri=r[2],
            width=r[3],
            height=r[4],
            created_at=r[5],
            last_annotated_at=r[6],
            last_annotated_by_user=r[7]
        )
        for r in rows
    ]

# List specific image
@app.get("/api/images/{image_id}")
def get_image(image_id: int):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, project_id, uri, width, height, created_at, last_annotated_at, last_annotated_by_user FROM images WHERE id = %s",
            (image_id,)
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    return dict(
        id=row[0],
        project_id=row[1],
        uri=row[2],
        width=row[3],
        height=row[4],
        created_at=row[5],
        last_annotated_at=row[6],
        last_annotated_by_user=row[7]
    )

# Update an image
@app.put("/api/images/{image_id}")
def update_image(image_id: int, data: ImageUpdate):
    set_clauses = []
    values = []
    if data.uri is not None:
        set_clauses.append("uri = %s")
        values.append(data.uri)
    if data.width is not None:
        set_clauses.append("width = %s")
        values.append(data.width)
    if data.height is not None:
        set_clauses.append("height = %s")
        values.append(data.height)
    if not set_clauses:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    values.append(image_id)
    sql = f"""
        UPDATE images
        SET {', '.join(set_clauses)}
        WHERE id = %s
        RETURNING id, project_id, uri, width, height, created_at, last_annotated_at, last_annotated_by_user
    """
    with conn.cursor() as cur:
        cur.execute(sql, tuple(values))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    return dict(
        id=row[0],
        project_id=row[1],
        uri=row[2],
        width=row[3],
        height=row[4],
        created_at=row[5],
        last_annotated_at=row[6],
        last_annotated_by_user=row[7]
    )

# Delete an image
@app.delete("/api/images/{image_id}")
def delete_image(image_id: int):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM images WHERE id = %s RETURNING id", (image_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"message": f"Image {row[0]} deleted"}

from fastapi.responses import StreamingResponse
import io

@app.get("/api/images/{image_id}/data")
def get_image_data(image_id: int):
    with conn.cursor() as cur:
        cur.execute("SELECT image_data, uri FROM images WHERE id = %s", (image_id,))
        row = cur.fetchone()
    if not row or row[0] is None:
        raise HTTPException(status_code=404, detail="Image data not found")
    return StreamingResponse(io.BytesIO(row[0]), media_type="image/jpeg")
