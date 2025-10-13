"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

type ImageItem = {
  id: number;
  filename: string;
};

export default function ImagesPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [newFile, setNewFile] = useState<File | null>(null);

  const router = useRouter();
  const params = useParams();
  const id = params.id;

  const projectId = Array.isArray(id) ? Number(id[0]) : Number(id);

  const fetchImages = useCallback(async () => {
    if (isNaN(projectId)) return;
  
    try {
      const res = await fetch(`http://localhost:8000/api/images?project_id=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch images");
      const data = await res.json();
  
      setImages(data.map((img: any) => ({ id: img.id, filename: img.uri })));
    } catch (err) {
      console.error(err);
    }
  }, [projectId]);

  useEffect(() => {
    setImages([]);
    fetchImages();
  }, [fetchImages]);

  const handleSelect = (imageId: number) => {
    router.push(`/labeling`);
  };

  const handleAdd = async () => {
    if (!newFile || isNaN(projectId)) return;

    const formData = new FormData();
    formData.append("project_id", String(projectId));
    formData.append("file", newFile);

    try {
      const res = await fetch("http://localhost:8000/api/images", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        console.error("Upload failed");
        return;
      }

      setNewFile(null);

      fetchImages();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (imageId: number) => {
    try {
      const res = await fetch(`http://localhost:8000/api/images/${imageId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        console.error("Delete failed");
        return;
      }

      fetchImages();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <h1>Select an Image</h1>

      <ul className="space-y-2">
        {images.map((img) => (
          <li key={img.id}>
            <span>{img.filename}</span>
            <img
              src={`http://localhost:8000/api/images/${img.id}/data`}
              alt={img.filename}
              width={100}
            />
            <button onClick={() => handleSelect(img.id)}>Label</button>
            <button onClick={() => handleDelete(img.id)}>Delete</button>
          </li>
        ))}
      </ul>

      <div>
        <h2 className="text-lg font-semibold">Add a New Image</h2>
        <input
          type="file"
          accept="image/png, image/jpeg"
          onChange={(e) => setNewFile(e.target.files?.[0] || null)}
        />
        <button disabled={!newFile} onClick={handleAdd}>
          Add Image
        </button>
      </div>
    </div>
  );
}
