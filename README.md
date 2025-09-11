# Auto Labeler

A labeling platform with:

- **Frontend:** Next.js (TypeScript, Konva, OpenCV.js)  
- **Backend:** FastAPI (Python 3.11)  
- **Database:** PostgreSQL 16  
 
---

## 🚀 Setup

1. Start the database:
   ```bash
   docker compose up -d db
   ```

2. Apply the schema:
   ```bash
   docker compose exec -T db psql -U labeler -d labeler -f /dev/stdin < backend/db/schema.sql
   ```

3. Start API + Web:
   ```bash
   docker compose up -d api web
   ```

4. Open in browser:
   - API: [http://localhost:8000/api/health](http://localhost:8000/api/health)  
   - Frontend: [http://localhost:3000](http://localhost:3000)  
   - Labeling page: [http://localhost:3000/labeling](http://localhost:3000/labeling)  

---

## 🔧 Common Commands

- Rebuild:
  ```bash
  docker compose up -d --build api web
  ```

- Reset DB:
  ```bash
  docker compose down -v
  docker compose up -d db
  docker compose exec -T db psql -U labeler -d labeler -f /dev/stdin < backend/db/schema.sql
  ```




