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
        const res = await fetch("/api/images");
        if (!res.ok) throw new Error("Failed to fetch images");
        const data = await res.json();
        setImages(data);
      } catch (err) {
        console.error(err);
        setImages([
          { id: 1, filename: "placeholderImg1.jpg" },
          { id: 2, filename: "placeholderImg2.jpg" },
        ]);
      }
    };
    fetchImages();
  }, []);

  const handleSelect = (id: number) => {
    router.push("/labeling/");
  };

  const handleAdd = async () => {
    if (!newFile) return;
    console.log("hello!");
    const res = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: newFile.name }),
    });

    const added = await res.json();
    setImages((prev) => [...prev, added]);
    setNewFile(null);
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
            <button
              onClick={() => handleSelect(img.id)}
            >
              Label
            </button>
          </li>
        ))}
      </ul>

      <div>
        <h2 className="text-lg font-semibold">Add a New Image</h2>
        <input
          type="file"
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
