"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ImageItem = {
  id: number;
  filename: string;
};

type ImageFolder = {
    folderName: string
    images: ImageItem[];
}

export default function ImagesPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  const [newFile, setNewFile] = useState<File | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/images");
        if (!res.ok) throw new Error("Failed to fetch images");
        const data = await res.json();
        setImages(data.map((img: any) => ({ id: img.id, filename: img.uri })));
      } catch (err) {
        console.error(err);
      }
    };
    fetchImages();
  }, []);

  const handleSelect = (id: number) => {
    router.push("/labeling/");
  };
  

  const handleAdd = async () => {
    if (!newFile) return;
  
    const formData = new FormData();
    formData.append("project_id", "1");
    formData.append("file", newFile);
  
    const res = await fetch("http://localhost:8000/api/images", {
      method: "POST",
      body: formData,
    });
  
    if (!res.ok) {
      console.error("Upload failed");
      return;
    }
  
    const added = await res.json();
    setImages((prev) => [...prev, { id: added.id, filename: added.uri }]);
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`http://localhost:8000/api/images/${id}`, {
      method: "DELETE",
    });
  
    if (!res.ok) {
      console.error("Delete failed");
      return;
    }
  
    setImages((prev) => prev.filter((img) => img.id !== id));
  };
  
  return (
    <div>
      <h1>Select an Image</h1>

      <ul className="space-y-2">
        {images.map((img) => (
          <li
            key={img.id}
          >
            <span>{img.filename}</span>
            <img
              src={`http://localhost:8000/api/images/${img.id}/data`}
              alt={img.filename}
              width={100}
            />

            <button
              onClick={() => handleSelect(img.id)}
            >
              Label
            </button>
            <button
              onClick={() => handleDelete(img.id)}
            >
              Delete
            </button>
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
        <button
          disabled={!newFile}
          onClick={handleAdd}
        >
          Add Image
        </button>
      </div>
    </div>
  );
}
