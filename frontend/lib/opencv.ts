// frontend/lib/opencv.ts
// OpenCV utility functions for edge detection and shape generation

declare global {
  interface Window {
    cv: any;
  }
}

type Point = { x: number; y: number };


//Checks if OpenCV is loaded and ready
export function isOpenCVReady(): boolean {
  return typeof window !== 'undefined' && typeof window.cv !== 'undefined';
}

/**
 * Extracts and processes a region from an image based on a drawn path
 * @param imageElement - The HTML image element
 * @param drawnPath - Array of points representing the user's drawn path
 * @param shapeMode - "polygon" or "bbox"
 * @param polygonSides - Number of sides for polygon approximation
 * @returns Processed points for the detected shape
 */
export async function processImageRegion(
  imageElement: HTMLImageElement,
  drawnPath: Point[],
  shapeMode: "polygon" | "bbox",
  polygonSides: number = 4
): Promise<number[]> {
  if (!isOpenCVReady()) {
    throw new Error("OpenCV is not loaded");
  }

  const cv = window.cv;

  try {
    // Step 1: Load image into OpenCV Mat
    const src = cv.imread(imageElement);

    // Step 2: Create mask from drawn path
    const mask = createMaskFromPath(src, drawnPath, cv);

    // Step 3: Apply mask to extract region
    const masked = new cv.Mat();
    src.copyTo(masked, mask);

    // Step 4: Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(masked, gray, cv.COLOR_RGBA2GRAY);

    // Step 5: Apply Gaussian blur to reduce noise
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Step 6: Apply Canny edge detection
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);

    // Step 7: Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Step 8: Find the largest contour (most likely the object)
    let largestContour = null;
    let maxArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > maxArea) {
        maxArea = area;
        largestContour = contour;
      }
    }

    let result: number[] = [];

    if (largestContour && maxArea > 100) { // Minimum area threshold
      if (shapeMode === "polygon") {
        // Approximate contour to polygon with specified number of sides
        result = approximateToPolygon(largestContour, polygonSides, cv);
      } else {
        // Create bounding box
        result = createBoundingBox(largestContour, cv);
      }
    } else {
      // If no good contour found, return simplified version of drawn path
      result = simplifyPath(drawnPath);
    }

    // Cleanup
    src.delete();
    mask.delete();
    masked.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return result;

  } catch (error) {
    console.error("Error processing image region:", error);
    // Fallback to simplified drawn path
    return simplifyPath(drawnPath);
  }
}

/**
 * Creates a binary mask from the drawn path
 */
function createMaskFromPath(src: any, path: Point[], cv: any): any {
  const mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

  // Convert path to OpenCV points format
  const points = path.map(p => new cv.Point(Math.round(p.x), Math.round(p.y)));
  const pointsVec = cv.matFromArray(points.length, 1, cv.CV_32SC2,
    points.flatMap(p => [p.x, p.y]));

  // Create contour vector
  const contours = new cv.MatVector();
  contours.push_back(pointsVec);

  // Fill the polygon on the mask
  cv.fillPoly(mask, contours, new cv.Scalar(255, 255, 255, 255));

  // Cleanup
  pointsVec.delete();
  contours.delete();

  return mask;
}

/**
 * Approximates a contour to a polygon with specified number of sides
 */
function approximateToPolygon(contour: any, targetSides: number, cv: any): number[] {
  // Use Douglas-Peucker algorithm to simplify contour initially
  const approx = new cv.Mat();
  const epsilon = 0.02 * cv.arcLength(contour, true);
  cv.approxPolyDP(contour, approx, epsilon, true);

  // Extract points from approximation
  let points: Point[] = [];
  
  // Get total number of points - OpenCV.js stores contours as Nx1 CV_32SC2 Mats
  const numPoints = approx.total();
  
  for (let i = 0; i < numPoints; i++) {
    points.push({
      x: approx.data32S[i * 2],
      y: approx.data32S[i * 2 + 1]
    });
  }

  console.log(`Initial approx points: ${points.length}, Target sides: ${targetSides}`);

  approx.delete();

  // Enforce exact number of sides
  points = enforcePolygonSides(points, targetSides);
  
  console.log(`After enforcement: ${points.length} points`);

  // Convert to flat array
  return points.flatMap(p => [p.x, p.y]);
}

/**
 * Enforces exact number of sides by adding or removing vertices
 */
function enforcePolygonSides(points: Point[], targetSides: number): Point[] {
  if (points.length === targetSides) {
    return points;
  }

  // Safety check to prevent infinite loops
  let iterations = 0;
  const maxIterations = 50;

  // If we have too many points, remove the least significant ones
  while (points.length > targetSides && iterations < maxIterations) {
    const newPoints = removeClosestPoint(points);
    // Check if we actually removed a point (avoid infinite loop)
    if (newPoints.length === points.length) {
      console.warn("Could not remove more points");
      break;
    }
    points = newPoints;
    iterations++;
  }

  iterations = 0;

  // If we have too few points, add interpolated ones
  while (points.length < targetSides && iterations < maxIterations) {
    const newPoints = addInterpolatedPoint(points);
    // Check if we actually added a point (avoid infinite loop)
    if (newPoints.length === points.length) {
      console.warn("Could not add more points");
      break;
    }
    points = newPoints;
    iterations++;
  }

  return points;
}

//Removes the point that creates the smallest angle (least significant corner)
function removeClosestPoint(points: Point[]): Point[] {
  if (points.length <= 3) return points;

  let minSignificance = Infinity;
  let removeIdx = 0;

  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    const angle = calculateAngle(prev, curr, next);

    // Find the point with angle closest to 180° (most collinear)
    // These are the least significant corners
    const significance = Math.abs(180 - angle);
    
    if (significance < minSignificance) {
      minSignificance = significance;
      removeIdx = i;
    }
  }

  // Remove the least significant point
  return points.filter((_, idx) => idx !== removeIdx);
}

//Adds an interpolated point on the longest edge 
function addInterpolatedPoint(points: Point[]): Point[] {
  if (points.length === 0) {
    console.warn("Cannot add point to empty array");
    return points;
  }

  let maxDistIdx = 0;
  let maxDist = 0;

  // Find the longest edge
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const dist = Math.hypot(next.x - curr.x, next.y - curr.y);

    if (dist > maxDist) {
      maxDist = dist;
      maxDistIdx = i;
    }
  }

  // Add a point at the midpoint of the longest edge
  const curr = points[maxDistIdx];
  const next = points[(maxDistIdx + 1) % points.length];
  const newPoint = {
    x: Math.round((curr.x + next.x) / 2),
    y: Math.round((curr.y + next.y) / 2)
  };

  // Insert the new point
  const result = [...points];
  result.splice(maxDistIdx + 1, 0, newPoint);
  return result;
}

/**
 * Calculates the angle at point B in degrees
 */
function calculateAngle(a: Point, b: Point, c: Point): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };

  const dotProduct = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.hypot(ba.x, ba.y);
  const magBC = Math.hypot(bc.x, bc.y);

  // Avoid division by zero
  if (magBA === 0 || magBC === 0) {
    return 180; // Return straight angle if points are coincident
  }

  const cosAngle = dotProduct / (magBA * magBC);
  // Clamp to [-1, 1] to avoid NaN from acos due to floating point errors
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));
  const angleRad = Math.acos(clampedCos);
  return (angleRad * 180) / Math.PI;
}

// Creates a rotated bounding box around a contour
function createBoundingBox(contour: any, cv: any): number[]
{
  const rect = cv.minAreaRect(contour);
  const vertices = cv.RotatedRect.points(rect);

  // Convert to flat array
  const points: number[] = [];
  for (let i = 0; i < 4; i++)
  {
    points.push(Math.round(vertices[i].x));
    points.push(Math.round(vertices[i].y));
  }

  return points;
}

//Simplifies a drawn path to fewer points (fallback when OpenCV processing fails)
function simplifyPath(path: Point[]): number[] {
  // Use a simple decimation: take every Nth point
  const targetPoints = 4;
  const step = Math.max(1, Math.floor(path.length / targetPoints));

  const simplified: number[] = [];
  for (let i = 0; i < path.length; i += step) {
    simplified.push(Math.round(path[i].x));
    simplified.push(Math.round(path[i].y));
  }

  return simplified;
}

//Converts normalized YOLO coordinates to pixel coordinates
export function yoloToPixels(
  yoloCoords: number[],
  imageWidth: number,
  imageHeight: number
): number[] {
  const pixels: number[] = [];
  for (let i = 0; i < yoloCoords.length; i += 2) {
    pixels.push(yoloCoords[i] * imageWidth);
    pixels.push(yoloCoords[i + 1] * imageHeight);
  }
  return pixels;
}

//Converts pixel coordinates to normalized YOLO format
export function pixelsToYOLO(
  pixels: number[],
  imageWidth: number,
  imageHeight: number
): number[] {
  const yolo: number[] = [];
  for (let i = 0; i < pixels.length; i += 2) {
    yolo.push(pixels[i] / imageWidth);
    yolo.push(pixels[i + 1] / imageHeight);
  }
  return yolo;
}