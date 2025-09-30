//frontend/components/ProjectCard.tsx
"use client";


import { TimePassed } from "@/lib/time";
import { useEffect, useState, useRef } from "react";

// generates different colors from the provided index
function indexToColor(index: number, total: number) {
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
    const [hover, setHover] = useState<boolean>(false);
    const dateRef = useRef<HTMLDivElement>(null);
    const timePassed = TimePassed(lastLabeledAt)
    useEffect(() => {
        const onHover = (e: MouseEvent) => setHover(true);
        const onLeave = (e: MouseEvent) => setHover(false);
        if (dateRef.current) {
            dateRef.current.addEventListener('mousemove', onHover);
            dateRef.current.addEventListener('mouseleave', onLeave)
        }


        return () => {
            if (dateRef.current) {
                dateRef.current.removeEventListener('mousemove', onHover);
                dateRef.current.removeEventListener('mouseleave', onLeave)
            }
        }
    });
   
    const Card = (<div className="hover:-translate-y-1 hover:cursor-pointer hover:shadow-2xl duration-250 shadow-xl rounded-lg px-6 py-2 min-h-fit min-w-[247px] w-100 h-50 flex-col relative" style={{backgroundColor: indexToColor(index, total)}} onClick={onClick}>
        <div className="flex flex-row items-center justify-start">
            <h2 className="text-2xl line-clamp-1">{name}</h2>
            <span className="ml-auto -translate-y-3 translate-x-1.5 text-4xl  ">…</span>

        </div>
        <div className="w-full h-[1px] opacity-25 my-0.5 bg-black"></div>
        { description && <p className="line-clamp-4 text-sm">{description}</p> }
        
        <div ref={dateRef} className="bg-gray-500 bg-w-full px-6 rounded-b-lg w-full h-[30%] absolute bottom-0 left-0 flex flex-row items-center">
            {hover ? (
                <>
                <p className="text-white">{lastLabeledAt.toLocaleDateString()}</p>
                <p className="text-white ml-auto" 
                    style={{color: `hsl(${labeledCount * 120 / totalImages}, 100%, 50%)`}} >
                        {labeledCount * 100 / totalImages}% completed
                    </p>

                </>
            ) : (
                <>
                    <p className="text-white">{timePassed}</p>
                    <p className="font-bold ml-auto "
                        style={{color: `hsl(${labeledCount * 120 / totalImages}, 100%, 50%)`}}>
                            {labeledCount}/{totalImages}
                    </p>
                </>
            )}

        </div>
        
        
    </div>);

    return href ? <a href={href}>{Card}</a> : Card;
}

export default ProjectCard;