// app/(app)/projects-page/page.tsx
import ProjectCard from "@/components/ProjectCard";
export default function ProjectsPage() {

  type Project = {
    id: number
    name: string;
    description?: string;
    labeledCount: number;
    totalImages: number;
    lastLabeledAt: Date;
  };

  const projects: Project[] = [
    {
      id: 1,
      name: "NaviGator",
      description: "The Machine Intelligence Laboratory (MIL) provides a synergistic environment dedicated to the study and development of intelligent, autonomous robots. The faculty and students associated with the laboratory conduct research in the theory and realization of machine intelligence covering topics such as machine learning, real-time computer vision, statistical modeling, robot kinematics, autonomous vehicles, teleoperation and human interfaces, robot and nonlinear control, computational intelligence, neural networks, and general robotics.",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2025-01-09")
    },
    {
      id: 2,
      name: "Subj",
      description: "The Machine Intelligence Laboratory (MIL) provides a synergistic environment dedicated to the study and development of intelligent, autonomous robots. The faculty and students associated with the laboratory conduct research in the theory and realization of machine intelligence covering topics such as machine learning, real-time computer vision, statistical modeling, robot kinematics, autonomous vehicles, teleoperation and human interfaces, robot and nonlinear control, computational intelligence, neural networks, and general robotics.",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2025-01-09")
    },
    {
      id: 3,
      name: "Obstacles for RoboSub Dolphins",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    },
    {
      id: 4,
      name: "Project 1",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    },
    {
      id: 5,
      name: "Project 1",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    },{
      id: 6,
      name: "Project 1",
      labeledCount: 3,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    }, 
    {
      id: 7,
      name: "Project 1",
      labeledCount: 2,
      totalImages: 4,
      lastLabeledAt: new Date("2024-01-09")
    },
  ]

  return <>
    <h1>Projects</h1>
    <div className="flex justify-center">
      <div className="flex flex-wrap justify-center gap-5 w-full">
        {projects.map((project, key) => {
          return (
            <ProjectCard 
              id={project.id}
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
  