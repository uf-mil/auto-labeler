// app/(app)/projects-page/page.tsx
import ProjectCard from "@/components/ProjectCard";
export default function ProjectsPage() {

  type Project = {
    name: string;
    description?: string;
    labeledCount: number;
    totalImages: number;
    lastLabeledAt: Date;
  };

  const projects: Project[] = [
    {
      name: "Project 1",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2025-01-09")
    },
    {
      name: "Project 1",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    },
    {
      name: "Project 1",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    },
    {
      name: "Project 1",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    },{
      name: "Project 1",
      labeledCount: 3,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    }, 
    {
      name: "Project 1",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    },
  ]

  return <>
    <h1>Projects</h1>
    <div className="flex justify-center">
      <div className="flex flex-wrap justify-center gap-5 w-full max-w-5xl">
        {projects.map((project, key) => {
          return (
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
          )
        })}
      </div>
    </div>
    
  </>;
  }
  