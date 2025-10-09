// frontend/components/CanvasStage.tsx
"use client";
import { useEffect, useState, useRef } from "react";
import { Stage, Layer, Line, Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";
import { processImageRegion } from "@/lib/opencv";

// Types
type Point = { x: number; y: number };
type ToolMode = "draw" | "pan" | "select";
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
    if (toolMode !== "draw") return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    setIsDrawing(true);
    setCurrentPath([{ x: point.x, y: point.y }]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || toolMode !== "draw") return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    setCurrentPath([...currentPath, { x: point.x, y: point.y }]);
  };

  const handleMouseUp = async (e: any) => {
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
            className={`px-3 py-1 rounded ${toolMode === "select" ? "bg-blue-500 text-white" : "bg-white"}`}
            onClick={() => setToolMode("select")}
          >
            Select
          </button>
        </div>

        {/* Shape Mode (when OpenCV is ready) */}
        {cvReady && (
          <div className="flex gap-2 items-center">
            <label className="font-semibold">Shape:</label>
            <button
              className={`px-3 py-1 rounded ${shapeMode === "polygon" ? "bg-green-500 text-white" : "bg-white"}`}
              onClick={() => setShapeMode("polygon")}
            >
              Polygon
            </button>
            <button
              className={`px-3 py-1 rounded ${shapeMode === "bbox" ? "bg-green-500 text-white" : "bg-white"}`}
              onClick={() => setShapeMode("bbox")}
            >
              BBox
            </button>
          </div>
        )}

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
            disabled={!isDrawing && currentPath.length === 0}
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
          {annotations.map((annotation) => (
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
          ))}

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
