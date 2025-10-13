// frontend/components/ProjectCard.tsx
"use client";

import { TimePassed } from "@/lib/time";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// generates different colors from the provided index
function indexToColor(index: number, total: number) {
  const hue = (index * 360) / total;
  return `hsl(${hue}, 70%, 50%,0.2)`;
}

interface ProjectCardProps {
  id: number;
  name: string;
  description?: string;
  labeledCount: number;
  totalImages: number;
  lastLabeledAt: Date;
  layout?: string;
  index: number;
  total: number;
}

export default function ProjectCard({
  id,
  name,
  description,
  labeledCount,
  totalImages,
  lastLabeledAt,
  index,
  total,
}: ProjectCardProps) {
  const router = useRouter();
  const [hover, setHover] = useState<boolean>(false);
  const dateRef = useRef<HTMLDivElement>(null);
  const timePassed = TimePassed(lastLabeledAt);

  useEffect(() => {
    const onHover = () => setHover(true);
    const onLeave = () => setHover(false);
    const ref = dateRef.current;
    if (ref) {
      ref.addEventListener("mousemove", onHover);
      ref.addEventListener("mouseleave", onLeave);
    }
    return () => {
      if (ref) {
        ref.removeEventListener("mousemove", onHover);
        ref.removeEventListener("mouseleave", onLeave);
      }
    };
  }, []);

  const handleClick = () => {
    router.push(`/images/${id}`);
  };

  return (
    <div
      onClick={handleClick}
      className="hover:-translate-y-1 hover:cursor-pointer hover:shadow-2xl duration-250 shadow-xl rounded-lg px-6 py-2 min-h-fit min-w-[247px] w-100 h-50 flex-col relative"
      style={{ backgroundColor: indexToColor(index, total) }}
    >
      <div className="flex flex-row items-center justify-start">
        <h2 className="text-2xl line-clamp-1">{name}</h2>
        <div className="relative inline-block group ml-auto -translate-y-3 translate-x-1.5 z-50">
          <span className="text-4xl hover:underline">…</span>
          <div className="absolute z-50 right-0 top-full mt-2 w-32 bg-white text-black text-sm rounded-lg shadow-md p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
            settings
          </div>
        </div>
      </div>

      <div className="w-full h-[1px] opacity-25 my-0.5 bg-black z-0"></div>
      {description && <p className="line-clamp-4 text-sm">{description}</p>}

      <div
        ref={dateRef}
        className="bg-gray-500 bg-w-full px-6 rounded-b-lg w-full h-[30%] absolute bottom-0 left-0 flex flex-row items-center"
      >
        {hover ? (
          <>
            <p className="text-white">{lastLabeledAt.toLocaleDateString()}</p>
            <p
              className="text-white ml-auto"
              style={{ color: `hsl(${labeledCount * 120 / totalImages}, 100%, 50%)` }}
            >
              {Math.round((labeledCount * 100) / totalImages)}% completed
            </p>
          </>
        ) : (
          <>
            <p className="text-white">{timePassed}</p>
            <p
              className="font-bold ml-auto"
              style={{ color: `hsl(${labeledCount * 120 / totalImages}, 100%, 50%)` }}
            >
              {labeledCount}/{totalImages}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
