// frontend/components/CanvasStage.tsx
"use client";
import { useEffect, useState, useRef } from "react";
import { Stage, Layer, Line, Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";
import { processImageRegion } from "@/lib/opencv";

// Types
type Point = { x: number; y: number };
type ToolMode = "draw" | "pan" | "select" | "rectangle";
type ShapeMode = "polygon" | "bbox";

type Annotation = {
  id: string;
  type: "polygon" | "bbox";
  points: number[]; // For polygon: [x1,y1,x2,y2,...], for bbox: [x,y,width,height]
  label?: string;
  color: string;
};

interface CanvasStageProps {
  imageUrl?: string;
  cvReady?: boolean;
  onAnnotationsChange?: (annotations: Annotation[]) => void;
}

// Image component that loads async
function DrawingImage({
  src,
  onImageLoad,
  x = 0,
  y = 0,
  scaleX = 1,
  scaleY = 1
}: {
  src: string;
  onImageLoad?: (img: HTMLImageElement) => void;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
}) {
  const [image] = useImage(src);

  useEffect(() => {
    if (image && onImageLoad) {
      onImageLoad(image);
    }
  }, [image, onImageLoad]);

  return <KonvaImage image={image} x={x} y={y} scaleX={scaleX} scaleY={scaleY} />;
}

export default function CanvasStage({
  imageUrl,
  cvReady = false,
  onAnnotationsChange
}: CanvasStageProps) {
  // Don't render Stage until mounted (avoids SSR/rehydration edge cases)
  const [mounted, setMounted] = useState(false);

  // Canvas state
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

  // Tool state
  const [toolMode, setToolMode] = useState<ToolMode>("draw");
  const [shapeMode, setShapeMode] = useState<ShapeMode>("polygon");
  const [polygonSides, setPolygonSides] = useState(4);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);

  // Rectangle state
  const [activeRect, setActiveRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isDraggingRect, setIsDraggingRect] = useState(false);
  const [isResizingRect, setIsResizingRect] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [rectStartPoint, setRectStartPoint] = useState<Point | null>(null);

  // Annotations state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationHistory, setAnnotationHistory] = useState<Annotation[][]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Refs
  const stageRef = useRef<any>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Center image when loaded
  useEffect(() => {
    if (loadedImage) {
      const offsetX = (canvasSize.width - loadedImage.width * zoom) / 2;
      const offsetY = (canvasSize.height - loadedImage.height * zoom) / 2;
      setImageOffset({ x: Math.max(0, offsetX), y: Math.max(0, offsetY) });
    }
  }, [loadedImage, canvasSize, zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      // Delete: Delete or Backspace
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      }
      // Draw mode: D key
      else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setToolMode('draw');
      }
      // Select mode: S key
      else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setToolMode('select');
      }
      // Rectangle mode: R key
      else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setToolMode('rectangle');
      }
      // Escape: Clear active rectangle or drawing
      else if (e.key === 'Escape') {
        e.preventDefault();
        handleClearDrawing();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [annotations, annotationHistory, selectedAnnotationId]);

  // Notify parent of annotation changes
  useEffect(() => {
    if (onAnnotationsChange) {
      onAnnotationsChange(annotations);
    }
  }, [annotations, onAnnotationsChange]);

  // Mouse handlers for drawing
  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (toolMode === "rectangle") {
      // Check if clicking on resize handle
      if (activeRect) {
        const handle = getClickedHandle(point, activeRect);
        if (handle) {
          setIsResizingRect(true);
          setResizeHandle(handle.id);
          return;
        }
        
        // Check if clicking inside rectangle (for dragging)
        if (isPointInRect(point, activeRect)) {
          setIsDraggingRect(true);
          return;
        }
      }
      
      // Start new rectangle
      setActiveRect({ x: point.x, y: point.y, width: 0, height: 0 });
      setRectStartPoint(point);
      setIsDraggingRect(true);
      return;
    }

    if (toolMode !== "draw") return;

    setIsDrawing(true);
    setCurrentPath([{ x: point.x, y: point.y }]);
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (toolMode === "rectangle") {
      if (isResizingRect && activeRect && resizeHandle) {
        // Handle resizing
        const newRect = { ...activeRect };
        
        switch (resizeHandle) {
          case 'nw':
            newRect.width += newRect.x - point.x;
            newRect.height += newRect.y - point.y;
            newRect.x = point.x;
            newRect.y = point.y;
            break;
          case 'ne':
            newRect.width = point.x - newRect.x;
            newRect.height += newRect.y - point.y;
            newRect.y = point.y;
            break;
          case 'sw':
            newRect.width += newRect.x - point.x;
            newRect.height = point.y - newRect.y;
            newRect.x = point.x;
            break;
          case 'se':
            newRect.width = point.x - newRect.x;
            newRect.height = point.y - newRect.y;
            break;
          case 'n':
            newRect.height += newRect.y - point.y;
            newRect.y = point.y;
            break;
          case 's':
            newRect.height = point.y - newRect.y;
            break;
          case 'w':
            newRect.width += newRect.x - point.x;
            newRect.x = point.x;
            break;
          case 'e':
            newRect.width = point.x - newRect.x;
            break;
        }
        
        // Ensure minimum size
        if (newRect.width < 10) newRect.width = 10;
        if (newRect.height < 10) newRect.height = 10;
        
        setActiveRect(newRect);
        return;
      }
      
      if (isDraggingRect && activeRect && rectStartPoint && !isResizingRect) {
        // Creating new rectangle
        const newRect = {
          x: Math.min(rectStartPoint.x, point.x),
          y: Math.min(rectStartPoint.y, point.y),
          width: Math.abs(point.x - rectStartPoint.x),
          height: Math.abs(point.y - rectStartPoint.y)
        };
        setActiveRect(newRect);
        return;
      }
    }

    if (!isDrawing || toolMode !== "draw") return;

    setCurrentPath([...currentPath, { x: point.x, y: point.y }]);
  };

  const handleMouseUp = async (e: any) => {
    if (toolMode === "rectangle") {
      if (isResizingRect) {
        setIsResizingRect(false);
        setResizeHandle(null);
        return;
      }
      
      if (isDraggingRect) {
        setIsDraggingRect(false);
        setRectStartPoint(null);
        
        // Only create annotation if rectangle has meaningful size
        if (activeRect && activeRect.width > 10 && activeRect.height > 10) {
          // Convert rectangle to annotation format [x, y, width, height]
          const rectPoints = [activeRect.x, activeRect.y, activeRect.width, activeRect.height];
          
          const newAnnotation: Annotation = {
            id: `annotation-${Date.now()}`,
            type: "bbox",
            points: rectPoints,
            color: getAnnotationColor(),
          };

          const newAnnotations = [...annotations, newAnnotation];
          setAnnotationHistory([...annotationHistory, annotations]);
          setAnnotations(newAnnotations);
          setActiveRect(null); // Clear active rectangle after creating annotation
        }
        return;
      }
    }

    if (!isDrawing || toolMode !== "draw") return;

    setIsDrawing(false);

    // Need at least 3 points to make a shape
    if (currentPath.length < 3) {
      setCurrentPath([]);
      return;
    }

    // If OpenCV is ready, process the region
    if (cvReady && imageUrl) {
      await processDrawnRegion();
    } else {
      // No OpenCV, just save the raw path as polygon
      saveAsRawPolygon();
    }

    setCurrentPath([]);
  };

  // Process drawn region with OpenCV
  const processDrawnRegion = async () => {
    if (!loadedImage) {
      console.warn("No image loaded, falling back to raw polygon");
      saveAsRawPolygon();
      return;
    }

    try {
      console.log("Processing with OpenCV...");
      // Use OpenCV to detect edges and create shape
      const processedPoints = await processImageRegion(
        loadedImage,
        currentPath,
        shapeMode,
        polygonSides
      );

      // Create annotation with processed points
      const newAnnotation: Annotation = {
        id: `annotation-${Date.now()}`,
        type: shapeMode,
        points: processedPoints,
        color: getAnnotationColor(),
      };

      const newAnnotations = [...annotations, newAnnotation];
      setAnnotationHistory([...annotationHistory, annotations]); // Save current state to history
      setAnnotations(newAnnotations);
      console.log("OpenCV processing complete!");
    } catch (error) {
      console.error("OpenCV processing failed, falling back to raw polygon:", error);
      saveAsRawPolygon();
    }
  };

  // Save the drawn path as-is as a polygon annotation
  const saveAsRawPolygon = () => {
    const points = currentPath.flatMap(p => [p.x, p.y]);

    const newAnnotation: Annotation = {
      id: `annotation-${Date.now()}`,
      type: "polygon",
      points,
      color: getAnnotationColor(),
    };

    const newAnnotations = [...annotations, newAnnotation];
    setAnnotationHistory([...annotationHistory, annotations]); // Save current state to history
    setAnnotations(newAnnotations);
  };

  // Clear current drawing
  const handleClearDrawing = () => {
    setCurrentPath([]);
    setIsDrawing(false);
    setActiveRect(null);
    setIsDraggingRect(false);
    setIsResizingRect(false);
    setResizeHandle(null);
    setRectStartPoint(null);
  };

  // Delete selected annotation
  const handleDeleteSelected = () => {
    if (selectedAnnotationId) {
      setAnnotationHistory([...annotationHistory, annotations]); // Save current state to history
      setAnnotations(annotations.filter(a => a.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    }
  };

  // Undo last annotation change
  const handleUndo = () => {
    if (annotationHistory.length > 0) {
      const previousState = annotationHistory[annotationHistory.length - 1];
      setAnnotations(previousState);
      setAnnotationHistory(annotationHistory.slice(0, -1));
      setSelectedAnnotationId(null);
    }
  };

  // Clear all annotations
  const handleClearAll = () => {
    setAnnotationHistory([...annotationHistory, annotations]); // Save current state to history
    setAnnotations([]);
    setSelectedAnnotationId(null);
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 3)); // Max 3x zoom
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.5)); // Min 0.5x zoom
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  // Get consistent annotation color
  const getAnnotationColor = () => {
    return "#4ECDC4"; // Consistent teal color for all annotations
  };

  // Rectangle utility functions
  const getResizeHandles = (rect: { x: number; y: number; width: number; height: number }) => [
    { id: 'nw', x: rect.x, y: rect.y, cursor: 'nw-resize' },
    { id: 'ne', x: rect.x + rect.width, y: rect.y, cursor: 'ne-resize' },
    { id: 'sw', x: rect.x, y: rect.y + rect.height, cursor: 'sw-resize' },
    { id: 'se', x: rect.x + rect.width, y: rect.y + rect.height, cursor: 'se-resize' },
    { id: 'n', x: rect.x + rect.width/2, y: rect.y, cursor: 'n-resize' },
    { id: 's', x: rect.x + rect.width/2, y: rect.y + rect.height, cursor: 's-resize' },
    { id: 'w', x: rect.x, y: rect.y + rect.height/2, cursor: 'w-resize' },
    { id: 'e', x: rect.x + rect.width, y: rect.y + rect.height/2, cursor: 'e-resize' }
  ];

  const getClickedHandle = (point: Point, rect: { x: number; y: number; width: number; height: number }) => {
    const handles = getResizeHandles(rect);
    const threshold = 8;
    
    return handles.find(handle => 
      Math.abs(point.x - handle.x) <= threshold && 
      Math.abs(point.y - handle.y) <= threshold
    );
  };

  const isPointInRect = (point: Point, rect: { x: number; y: number; width: number; height: number }) => {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
           point.y >= rect.y && point.y <= rect.y + rect.height;
  };

  // Auto-switch to rectangle mode when bbox shape is selected
  useEffect(() => {
    if (shapeMode === "bbox" && toolMode === "draw") {
      setToolMode("rectangle");
    }
  }, [shapeMode, toolMode]);

  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="bg-gray-100 rounded-lg p-4 flex flex-wrap gap-4 items-center">
        {/* Tool Mode */}
        <div className="flex gap-2">
          <label className="font-semibold">Tool:</label>
          <button
            className={`px-3 py-1 rounded ${toolMode === "draw" ? "bg-blue-500 text-white" : "bg-white"}`}
            onClick={() => setToolMode("draw")}
          >
          Draw
          </button>
          <button
            className={`px-3 py-1 rounded ${toolMode === "rectangle" ? "bg-blue-500 text-white" : "bg-white"}`}
            onClick={() => setToolMode("rectangle")}
          >
            Rectangle
          </button>
          <button
            className={`px-3 py-1 rounded ${toolMode === "select" ? "bg-blue-500 text-white" : "bg-white"}`}
            onClick={() => setToolMode("select")}
          >
            Select
          </button>
        </div>

        {/* Polygon sides slider (when in polygon mode) */}
        {cvReady && shapeMode === "polygon" && (
          <div className="flex gap-2 items-center">
            <label className="font-semibold">Sides:</label>
            <input
              type="range"
              min="3"
              max="12"
              value={polygonSides}
              onChange={(e) => setPolygonSides(parseInt(e.target.value))}
              className="w-24"
            />
            <span className="w-8 text-center">{polygonSides}</span>
          </div>
        )}

        {/* Zoom controls */}
        <div className="flex gap-2 items-center">
          <label className="font-semibold">Zoom:</label>
          <button
            className="px-3 py-1 rounded bg-gray-500 text-white hover:bg-gray-600"
            onClick={handleZoomOut}
          >
            -
          </button>
          <span className="w-16 text-center">{(zoom * 100).toFixed(0)}%</span>
          <button
            className="px-3 py-1 rounded bg-gray-500 text-white hover:bg-gray-600"
            onClick={handleZoomIn}
          >
            +
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-400 text-white hover:bg-gray-500 text-sm"
            onClick={handleResetZoom}
          >
            Reset
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 ml-auto">
          <button
            className="px-3 py-1 rounded bg-purple-500 text-white hover:bg-purple-600"
            onClick={handleUndo}
            disabled={annotationHistory.length === 0}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            className="px-3 py-1 rounded bg-yellow-500 text-white hover:bg-yellow-600"
            onClick={handleClearDrawing}
            disabled={!isDrawing && currentPath.length === 0 && !activeRect}
          >
            Clear Drawing
          </button>
          <button
            className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
            onClick={handleDeleteSelected}
            disabled={!selectedAnnotationId}
            title="Delete (Del/Backspace)"
          >
            Delete Selected
          </button>
          <button
            className="px-3 py-1 rounded bg-red-700 text-white hover:bg-red-800"
            onClick={handleClearAll}
            disabled={annotations.length === 0}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Info Bar */}
      <div className="bg-blue-50 rounded p-2 text-sm">
        <p>
          <strong>Mode:</strong> {toolMode} |
          <strong> Annotations:</strong> {annotations.length} |
          <strong> OpenCV:</strong> {cvReady ? "✓ Ready" : "✗ Not loaded"}
          {!imageUrl && <span className="text-orange-600 ml-2">⚠ No image loaded</span>}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          <strong>Hotkeys:</strong> D=Draw | S=Select | Ctrl+Z=Undo | Del/Backspace=Delete
        </p>
      </div>

      {/* Canvas */}
      <Stage
        ref={stageRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ border: "2px solid #333", borderRadius: "8px", backgroundColor: "#f9f9f9" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer>
          {/* Background Image */}
          {imageUrl && (
            <DrawingImage
              src={imageUrl}
              onImageLoad={setLoadedImage}
              x={imageOffset.x}
              y={imageOffset.y}
              scaleX={zoom}
              scaleY={zoom}
            />
          )}

          {/* Saved Annotations */}
          {annotations.map((annotation) => {
            if (annotation.type === "bbox") {
              // Render bounding box as rectangle
              const [x, y, width, height] = annotation.points;
              return (
                <Rect
                  key={annotation.id}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  stroke={annotation.color}
                  strokeWidth={3}
                  fill={annotation.color + "40"} // Add transparency
                  onClick={() => {
                    if (toolMode === "select") {
                      setSelectedAnnotationId(annotation.id);
                    }
                  }}
                  onDblClick={() => {
                    // Double-click to enter select mode and select this annotation
                    setToolMode("select");
                    setSelectedAnnotationId(annotation.id);
                  }}
                  opacity={selectedAnnotationId === annotation.id ? 0.8 : 0.5}
                />
              );
            } else {
              // Render polygon as line
              return (
                <Line
                  key={annotation.id}
                  points={annotation.points}
                  stroke={annotation.color}
                  strokeWidth={3}
                  closed={true}
                  fill={annotation.color + "40"} // Add transparency
                  onClick={() => {
                    if (toolMode === "select") {
                      setSelectedAnnotationId(annotation.id);
                    }
                  }}
                  onDblClick={() => {
                    // Double-click to enter select mode and select this annotation
                    setToolMode("select");
                    setSelectedAnnotationId(annotation.id);
                  }}
                  opacity={selectedAnnotationId === annotation.id ? 0.8 : 0.5}
                />
              );
            }
          })}

          {/* Active Rectangle */}
          {toolMode === "rectangle" && activeRect && (
            <>
              {/* Main rectangle */}
              <Rect
                x={activeRect.x}
                y={activeRect.y}
                width={activeRect.width}
                height={activeRect.height}
                stroke="#0066FF"
                strokeWidth={2}
                fill="rgba(0, 102, 255, 0.1)"
              />
              
              {/* Resize handles */}
              {getResizeHandles(activeRect).map(handle => (
                <Rect
                  key={handle.id}
                  x={handle.x - 4}
                  y={handle.y - 4}
                  width={8}
                  height={8}
                  fill="#0066FF"
                  stroke="#ffffff"
                  strokeWidth={1}
                />
              ))}
            </>
          )}

          {/* Current Drawing Path */}
          {isDrawing && currentPath.length > 0 && (
            <Line
              points={currentPath.flatMap(p => [p.x, p.y])}
              stroke="#0066FF"
              strokeWidth={2}
              lineCap="round"
              lineJoin="round"
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
