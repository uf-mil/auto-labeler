// app/(app)/projects-page/page.tsx
import ProjectCard from "@/components/ProjectCard";

export default function ProjectsPage() {
    return <>
      <div style={{padding: 24}}>Projects list goes here</div>
      <ProjectCard name="Project 1" description="Project 1 Desc." labeledCount={4} totalImages={2} lastLabeledAt="9/14/2025"/>
      <ProjectCard name="Project 2" description="Project 2 Desc." labeledCount={9} totalImages={3} lastLabeledAt="9/15/2025"/>
      <ProjectCard name="Project 3" labeledCount={1} totalImages={2} lastLabeledAt=""/>
    </>;
  }
  