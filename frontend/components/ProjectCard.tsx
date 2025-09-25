//frontend/components/ProjectCard.tsx
"use client";


import { TimePassed } from "@/lib/time";
import { useEffect, useState, useRef } from "react";

// generates different colors from the provided index
function indexToColor(index, total) {
  const hue = (index * 360) / total;
  return `hsl(${hue}, 70%, 50%,0.2)`; 
}


function ProjectCard({
    name,
    description,
    labeledCount,
    totalImages,
    lastLabeledAt,
    onClick,
    href,
    layout, // For deciding dynamic layout later.
    index,
    total
 }:  
    {
    name: string,
    description?: string,
    labeledCount: number,
    totalImages: number,
    lastLabeledAt: Date,
    onClick?: () => void,
    href?: string,
    layout?: string,
    index: number,
    total: number,
     } ) 
{   
    const [hover, setHover] = useState<{x: number, y: number} | false>(false);
    const dateRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timePassed = TimePassed(lastLabeledAt)
    useEffect(() => {
        const onHover = (e: MouseEvent) => {
            setHover({x: e.offsetX, y: e.offsetY});
        };
        const onLeave = () => {
            setHover(false);
            if (dateRef.current) dateRef.current.removeEventListener('mouseover',onHover);
        }
        if (dateRef.current) {
            dateRef.current.addEventListener('mouseover', onHover);
            dateRef.current.addEventListener('mouseleave', onLeave)
        }


        return () => {
            if (dateRef.current) dateRef.current.removeEventListener('mouseover',onHover);
        }
    });
    useEffect(() => {
        if (hover && tooltipRef.current) {
            tooltipRef.current.style.left = `${hover.x}px`;
            tooltipRef.current.style.top = `${hover.y}px`;
        } else if (tooltipRef.current)  {
            tooltipRef.current.style.left = '';
            tooltipRef.current.style.top = '';
        }
    }, [hover])
    const Card = (<div className="hover:scale-105 hover:cursor-pointer duration-250 border-4 rounded-lg p-6 min-h-fit min-w-[247px] w-100 h-50 flex-col relative" style={{backgroundColor: indexToColor(index, total)}} onClick={onClick}>
        <h2 className="text-3xl font-bold underline">{name}</h2>
        { description && <p>{description}</p> }
        
        <p>Last Labeled: {lastLabeledAt.toLocaleDateString() ?? "-"}</p>
        <div ref={dateRef} className="bg-gray-500 bg-w-full px-6 w-full py-3 absolute bottom-0 left-0 flex flex-row">
            <p className="text-white">{timePassed}</p>
            <p className="font-bold ml-auto "
                style={{color: `hsl(${labeledCount * 120 / totalImages}, 100%, 50%)`}}>
                    {labeledCount} / {totalImages}
            </p>

        </div>
        
        <div ref={tooltipRef} className={`bg-gray-500 bg-w-full px-6 w-full py-3 absolute bottom-0 left-0 ${hover ? 'fixed' : 'hidden'}`}>

        </div>
    </div>);

    return href ? <a href={href}>{Card}</a> : Card;
}

export default ProjectCard;