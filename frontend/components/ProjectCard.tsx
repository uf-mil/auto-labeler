//frontend/components/ProjectCard.tsx
"use-client";

function ProjectCard({
    name,
    description,
    labeledCount,
    totalImages,
    lastLabeledAt,
    onClick,
    href,
    layout }: // For deciding dynamic layout later. 
    {
    name: string,
    description?: string,
    labeledCount: number,
    totalImages: number,
    lastLabeledAt: string,
    onClick?: () => void,
    href?: string,
    layout?: string } ) 
{
    const Card = (<div onClick={onClick}>
        <h2>{name}</h2>
        { description && <p>Description: {description}</p> }
        <p>Images Labeled: {labeledCount / totalImages}</p>
        <p>Last Labeled: {lastLabeledAt ?? "-"}</p>    
    </div>);

    return href ? <a href={href}>{Card}</a> : Card;
}

export default ProjectCard;