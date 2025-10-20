// app/(app)/projects-page/page.tsx
"use client";
import { useEffect, useState } from "react";
import ProjectCard from "@/components/ProjectCard";
export default function ProjectsPage() {
  
  type Project = {
    name: string;
    description?: string;
    labeledCount: number;
    totalImages: number;
    lastLabeledAt: Date;
  };

  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/projects");
        if (!res.ok) throw new Error("Failed to fetch projects");
        const data = await res.json();

        const formatted: Project[] = data.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description || "",
          labeledCount: p.labeledCount ?? 0,
          totalImages: p.totalImages ?? 0,
          lastLabeledAt: p.lastLabeledAt ? new Date(p.lastLabeledAt) : new Date(),
        }));

        setProjects(formatted);
      } catch (err) {
        console.error("Error fetching projects:", err);
      }
    };

    fetchProjects();
  }, []);

  return (
    <>
      <h1>Projects</h1>
      <div className="flex justify-center">
        <div className="flex flex-wrap justify-center gap-5 w-full">
          {projects.map((project, key) => (
            <ProjectCard
              key={key}
              name={project.name}
              description={project.description}
              labeledCount={project.labeledCount}
              totalImages={project.totalImages}
              lastLabeledAt={project.lastLabeledAt}
              total={projects.length}
              index={key}
            />
          ))}
        </div>
      </div>
    </>
  );
}
