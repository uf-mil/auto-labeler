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
 * Uses a multi-strategy approach for accurate object boundary detection
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
  let canvas: HTMLCanvasElement | null = null;

  try {
    console.log(`Processing region with ${drawnPath.length} points, target: ${polygonSides} sides`);
    
    // Step 1: Create canvas to avoid CORS issues
    canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Could not create canvas context");
    }
    
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    ctx.drawImage(imageElement, 0, 0);
    
    // Step 2: Load image from canvas into OpenCV Mat
    const src = cv.imread(canvas);

    // Step 3: Try multiple accurate methods in order of preference
    let result: number[] = [];
    
    // Method 1: GrabCut - Best for clear foreground/background separation
    console.log("Trying GrabCut segmentation...");
    // result = tryGrabCutMethod(src, drawnPath, shapeMode, polygonSides, cv);
    // if (result.length > 0) {
    //   console.log("GrabCut successful!");
    //   src.delete();
    //   if (canvas) canvas.remove();
    //   return result;
    // }

    // Method 2: Watershed - Good for touching objects
    console.log("Trying Watershed segmentation...");
    result = tryWatershedMethod(src, drawnPath, shapeMode, polygonSides, cv);
    if (result.length > 0) {
      console.log("Watershed successful!");
      src.delete();
      if (canvas) canvas.remove();
      return result;
    }

    // Method 3: Adaptive edge detection - Robust fallback
    console.log("Trying adaptive edge detection...");
    result = tryAdaptiveEdgeMethod(src, drawnPath, shapeMode, polygonSides, cv);
    if (result.length > 0) {
      console.log("Adaptive edge detection successful!");
      src.delete();
      if (canvas) canvas.remove();
      return result;
    }

    // Fallback: Intelligent path simplification
    console.log("Using intelligent path simplification fallback");
    result = intelligentPathSimplification(drawnPath, polygonSides);
    
    // Cleanup
    src.delete();
    if (canvas) canvas.remove();

    return result;

  } catch (error) {
    console.error("Error processing image region:", error);
    // Try to cleanup on error
    if (canvas) {
      try { canvas.remove(); } catch { /* ignore */ }
    }
    // Fallback to intelligent path simplification
    return intelligentPathSimplification(drawnPath, polygonSides);
  }
}

// ============================================================================
// METHOD 1: GrabCut Algorithm - Primary Object Detection Method
// ============================================================================

/**
 * GrabCut Segmentation - The most sophisticated object detection method
 * 
 * PURPOSE: Separates objects from background using statistical modeling
 * SIGNIFICANCE: This is the gold standard for object segmentation in computer vision
 * 
 * HOW IT WORKS:
 * 1. Uses user's drawn path to define "definitely foreground" pixels
 * 2. Creates statistical models of foreground vs background pixel colors
 * 3. Applies graph cut algorithm to find optimal boundary between regions
 * 4. Iteratively refines the boundary based on color similarity
 * 
 * WHEN IT WORKS BEST:
 * - Objects with distinct colors from background
 * - Clear boundaries (person against sky, car on road)
 * - Sufficient color contrast between object and surroundings
 * 
 * ALGORITHM DETAILS:
 * - Uses Gaussian Mixture Models (GMM) for color modeling
 * - Graph cuts minimize energy function across pixel boundaries  
 * - Iterative optimization (typically 5 iterations is sufficient)
 */
// function tryGrabCutMethod(
//   src: any, 
//   drawnPath: Point[], 
//   shapeMode: "polygon" | "bbox", 
//   polygonSides: number, 
//   cv: any
// ): number[] {
//   try {
//     if (drawnPath.length < 3) return [];

//     // Create GrabCut mask and models
//     const mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
//     const bgdModel = new cv.Mat();
//     const fgdModel = new cv.Mat();

//     // Get bounding rectangle of user's drawn path
//     const bounds = getBounds(drawnPath);
//     const rect = new cv.Rect(bounds.x, bounds.y, bounds.width, bounds.height);

//     // Initialize: everything outside rectangle is background
//     mask.setTo(new cv.Scalar(cv.GC_BGD)); // Definite background
    
//     // Set rectangle region as "probably foreground"
//     const roiMask = mask.roi(rect);
//     roiMask.setTo(new cv.Scalar(cv.GC_PR_FGD)); // Probably foreground
//     roiMask.delete();

//     // Mark user's drawn path as "definite foreground"
//     const pathMask = createPathMask(src, drawnPath, cv);
//     const foregroundPixels = cv.findNonZero(pathMask);
    
//     for (let i = 0; i < foregroundPixels.rows; i++) {
//       const x = foregroundPixels.data32S[i * 2];
//       const y = foregroundPixels.data32S[i * 2 + 1];
//       if (y >= 0 && y < mask.rows && x >= 0 && x < mask.cols) {
//         mask.ucharPtr(y, x)[0] = cv.GC_FGD; // Definite foreground
//       }
//     }
    
//     pathMask.delete();
//     foregroundPixels.delete();

//     // Run GrabCut algorithm (5 iterations is usually enough)
//     cv.grabCut(src, mask, rect, bgdModel, fgdModel, 5, cv.GC_INIT_WITH_MASK);

//     // Extract final foreground mask
//     const finalMask = new cv.Mat();
//     cv.compare(mask, new cv.Scalar(cv.GC_PR_FGD), finalMask, cv.CMP_EQ);
//     const fgMask2 = new cv.Mat();
//     cv.compare(mask, new cv.Scalar(cv.GC_FGD), fgMask2, cv.CMP_EQ);
//     cv.bitwise_or(finalMask, fgMask2, finalMask);

//     // Find best contour and convert to shape
//     const result = extractShapeFromMask(finalMask, shapeMode, polygonSides, bounds, cv);

//     // Cleanup
//     mask.delete();
//     bgdModel.delete();
//     fgdModel.delete();
//     finalMask.delete();
//     fgMask2.delete();

//     return result;
//   } catch (error) {
//     console.warn("GrabCut method failed:", error);
//     return [];
//   }
// }

// ============================================================================
// METHOD 2: Watershed Algorithm - Secondary Detection Method
// ============================================================================

/**
 * Watershed Segmentation - Treats image like topographical landscape
 * 
 * PURPOSE: Separates objects that are touching or have similar colors to background
 * SIGNIFICANCE: Excels where color-based methods like GrabCut fail
 * 
 * HOW IT WORKS:
 * 1. Converts image to grayscale intensity "height map"
 * 2. Places "markers" for definite foreground (inside user path) and background (outside)
 * 3. Simulates water flooding from markers - watersheds form object boundaries
 * 4. Uses morphological operations to clean up and refine boundaries
 * 
 * WHEN IT WORKS BEST:
 * - Objects touching other objects (overlapping fruit, clustered items)
 * - Similar colors between object and background
 * - Complex backgrounds where color modeling fails
 * - Objects with strong internal texture/patterns
 * 
 * ALGORITHM DETAILS:
 * - Based on mathematical morphology and regional minima
 * - Uses distance transform to create "basin" structure
 * - Flooding simulation finds natural separation boundaries
 */
function tryWatershedMethod(
  src: any, 
  drawnPath: Point[], 
  shapeMode: "polygon" | "bbox", 
  polygonSides: number, 
  cv: any
): number[] {
  try {
    if (drawnPath.length < 3) return [];

    // Convert to grayscale for watershed
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Create markers for watershed
    const markers = cv.Mat.zeros(src.rows, src.cols, cv.CV_32S);
    
    // Mark definite background (area outside drawn path + margin)
    const backgroundMask = createBackgroundMask(src, drawnPath, 30, cv);
    markers.setTo(new cv.Scalar(1), backgroundMask);

    // Mark definite foreground (center area of drawn path)
    const foregroundMask = createPathMask(src, drawnPath, cv);
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    cv.morphologyEx(foregroundMask, foregroundMask, cv.MORPH_ERODE, kernel, new cv.Point(-1, -1), 2);
    markers.setTo(new cv.Scalar(2), foregroundMask);

    // Apply watershed
    cv.watershed(src, markers);

    // Extract region marked as foreground (value 2)
    const resultMask = new cv.Mat();
    cv.compare(markers, new cv.Scalar(2), resultMask, cv.CMP_EQ);

    // Convert to shape
    const bounds = getBounds(drawnPath);
    const result = extractShapeFromMask(resultMask, shapeMode, polygonSides, bounds, cv);

    // Cleanup
    gray.delete();
    markers.delete();
    backgroundMask.delete();
    foregroundMask.delete();
    kernel.delete();
    resultMask.delete();

    return result;
  } catch (error) {
    console.warn("Watershed method failed:", error);
    return [];
  }
}

// ============================================================================
// METHOD 3: Adaptive Edge Detection - Fallback Method
// ============================================================================

/**
 * Adaptive Edge Detection - Local threshold-based boundary detection
 * 
 * PURPOSE: Reliable fallback when statistical methods (GrabCut/Watershed) fail
 * SIGNIFICANCE: Always produces some result, handles difficult lighting/contrast
 * 
 * HOW IT WORKS:
 * 1. Applies bilateral filter to reduce noise while preserving sharp edges
 * 2. Uses adaptive thresholding that adjusts to local image conditions
 * 3. Inverts result to get object boundaries as white pixels
 * 4. Applies morphological operations to connect broken edges and remove noise
 * 
 * WHEN IT WORKS BEST:
 * - Poor lighting conditions (shadows, reflections)
 * - Low contrast between object and background
 * - Highly textured objects and backgrounds
 * - When color information is unreliable
 * 
 * ALGORITHM DETAILS:
 * - Bilateral filtering preserves edges while smoothing uniform areas
 * - Adaptive threshold uses local neighborhood statistics (11x11 kernel)
 * - Morphological closing connects nearby edges, opening removes small noise
 */
function tryAdaptiveEdgeMethod(
  src: any, 
  drawnPath: Point[], 
  shapeMode: "polygon" | "bbox", 
  polygonSides: number, 
  cv: any
): number[] {
  try {
    if (drawnPath.length < 3) return [];

    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Create region of interest mask
    const roiMask = createPathMask(src, drawnPath, cv);

    // Apply bilateral filter to reduce noise while preserving edges
    const filtered = new cv.Mat();
    cv.bilateralFilter(gray, filtered, 9, 75, 75);

    // Use adaptive threshold instead of Canny for better edge detection
    const edges = new cv.Mat();
    cv.adaptiveThreshold(filtered, edges, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
    
    // Invert (we want object boundaries as white)
    cv.bitwise_not(edges, edges);
    
    // Apply ROI mask
    cv.bitwise_and(edges, roiMask, edges);

    // Clean up edges with morphological operations
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(edges, edges, cv.MORPH_OPEN, kernel);

    // Convert to shape
    const bounds = getBounds(drawnPath);
    const result = extractShapeFromMask(edges, shapeMode, polygonSides, bounds, cv);

    // Cleanup
    gray.delete();
    roiMask.delete();
    filtered.delete();
    edges.delete();
    kernel.delete();

    return result;
  } catch (error) {
    console.warn("Adaptive edge method failed:", error);
    return [];
  }
}

// ============================================================================
// CORE UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates Binary Mask from User's Drawn Path
 * 
 * PURPOSE: Converts user's freehand drawing into a binary image mask
 * SIGNIFICANCE: This is the foundation for all CV methods - defines the region of interest
 * 
 * PROCESS:
 * 1. Creates black image (zeros) same size as source
 * 2. Converts user's path points to OpenCV Point format  
 * 3. Fills the enclosed polygon area with white pixels (255)
 * 4. Result: Binary mask where white = user's selected region, black = background
 * 
 * TECHNICAL DETAILS:
 * - Uses OpenCV's fillPoly function for accurate polygon filling
 * - Handles any polygon shape (convex, concave, self-intersecting)
 * - Memory management: properly deletes temporary OpenCV objects
 */
function createPathMask(src: any, path: Point[], cv: any): any {
  const mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

  // Convert path to OpenCV points format
  const points = path.map(p => new cv.Point(Math.round(p.x), Math.round(p.y)));
  const pointsVec = cv.matFromArray(points.length, 1, cv.CV_32SC2,
    points.flatMap(p => [p.x, p.y]));

  // Create contour vector
  const contours = new cv.MatVector();
  contours.push_back(pointsVec);

  // Fill the polygon on the mask
  cv.fillPoly(mask, contours, new cv.Scalar(255));

  // Cleanup
  pointsVec.delete();
  contours.delete();

  return mask;
}

/**
 * Creates Background Region Mask for Watershed Algorithm
 * 
 * PURPOSE: Defines areas that are definitely NOT part of the object
 * SIGNIFICANCE: Provides negative examples to improve segmentation accuracy
 * 
 * PROCESS:
 * 1. Calculates expanded bounding box around user's drawn path
 * 2. Fills entire image as "background" (white)
 * 3. Cuts out the expanded object region (sets to black)
 * 4. Result: Areas far from user's selection are marked as definite background
 * 
 * WHY MARGIN MATTERS:
 * - Prevents algorithm from considering nearby similar objects
 * - Gives clean separation between foreground and background training data
 * - Improves accuracy by providing clear negative examples
 */
function createBackgroundMask(src: any, path: Point[], margin: number, cv: any): any {
  const mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
  
  // Get expanded bounds
  const bounds = getBounds(path);
  const expandedBounds = {
    x: Math.max(0, bounds.x - margin),
    y: Math.max(0, bounds.y - margin),
    width: Math.min(src.cols - (bounds.x - margin), bounds.width + 2 * margin),
    height: Math.min(src.rows - (bounds.y - margin), bounds.height + 2 * margin)
  };
  
  // Fill entire image as background
  mask.setTo(new cv.Scalar(255));
  
  // Remove the expanded object area
  cv.rectangle(mask,
    new cv.Point(expandedBounds.x, expandedBounds.y),
    new cv.Point(expandedBounds.x + expandedBounds.width, expandedBounds.y + expandedBounds.height),
    new cv.Scalar(0),
    -1
  );
  
  return mask;
}

/**
 * Calculate Bounding Rectangle from Path Points
 * 
 * PURPOSE: Find smallest rectangle that contains all user's drawn points
 * SIGNIFICANCE: Defines search area for object detection algorithms
 * 
 * ALGORITHM:
 * 1. Finds minimum and maximum X and Y coordinates from all path points
 * 2. Calculates width = maxX - minX, height = maxY - minY  
 * 3. Returns rectangle coordinates (x, y, width, height)
 * 
 * USAGE:
 * - Limits CV processing to relevant image region (performance optimization)
 * - Provides initial rectangle for GrabCut algorithm
 * - Used for overlap calculations in contour selection
 */
function getBounds(path: Point[]): { x: number; y: number; width: number; height: number } {
  if (path.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  
  let minX = path[0].x, maxX = path[0].x;
  let minY = path[0].y, maxY = path[0].y;
  
  for (const point of path) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY)
  };
}

/**
 * Extract Final Shape from Binary Mask - CORE DETECTION LOGIC
 * 
 * PURPOSE: Converts CV algorithm results into user-requested shape format
 * SIGNIFICANCE: This is where all CV methods converge - the final shape extraction
 * 
 * CRITICAL DECISION PROCESS:
 * 1. Finds all contours (object boundaries) in the processed mask
 * 2. Scores each contour based on area and overlap with user's original drawing
 * 3. Selects best contour using intelligent scoring (not just largest)
 * 4. Converts to requested format (polygon with N sides, or bounding box)
 * 
 * INTELLIGENT CONTOUR SELECTION:
 * - Area weight: Larger objects are more likely to be the target
 * - Overlap bonus: Contours overlapping user's drawing get priority
 * - Size threshold: Filters out tiny noise contours (< 100 pixels)
 * 
 * WHY THIS MATTERS:
 * - Previous approach just took "largest contour" which often grabbed background
 * - New approach considers user intent (what they actually drew around)
 * - Produces much more accurate results aligned with user expectations
 */
function extractShapeFromMask(
  mask: any, 
  shapeMode: "polygon" | "bbox", 
  polygonSides: number, 
  searchBounds: { x: number; y: number; width: number; height: number }, 
  cv: any
): number[] {
  try {
    // Find contours in the mask
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() === 0) {
      contours.delete();
      hierarchy.delete();
      return [];
    }

    // Find best contour (largest area that overlaps with search bounds)
    let bestContour = null;
    let bestScore = -1;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      if (area < 100) continue; // Skip tiny contours
      
      // Calculate overlap with user's drawn area
      const boundingRect = cv.boundingRect(contour);
      const overlap = calculateOverlap(boundingRect, searchBounds);
      
      // Score: prioritize area and overlap with user's drawing
      const score = area * (1 + overlap * 2); // Bonus for overlapping user's area
      
      if (score > bestScore) {
        bestScore = score;
        bestContour = contour;
      }
    }

    let result: number[] = [];
    if (bestContour) {
      if (shapeMode === "polygon") {
        result = convertToControlledPolygon(bestContour, polygonSides, cv);
      } else {
        result = convertToBoundingBox(bestContour, cv);
      }
    }

    // Cleanup
    contours.delete();
    hierarchy.delete();

    return result;
  } catch (error) {
    console.warn("Shape extraction failed:", error);
    return [];
  }
}

/**
 * Calculate Geometric Overlap Between Two Rectangles
 * 
 * PURPOSE: Measures how much one rectangle overlaps with another (0.0 to 1.0)
 * SIGNIFICANCE: Used to prioritize contours that align with user's drawn region
 * 
 * MATHEMATICAL APPROACH:
 * 1. Finds intersection rectangle coordinates
 * 2. Calculates intersection area = width × height
 * 3. Returns ratio: intersection_area / first_rectangle_area
 * 
 * APPLICATIONS:
 * - Contour scoring: Higher overlap = better match with user intent
 * - Quality validation: Ensures CV results relate to user's selection
 * - Prevents selection of unrelated objects in the image
 */
function calculateOverlap(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(rect1.x, rect2.x);
  const y1 = Math.max(rect1.y, rect2.y);
  const x2 = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
  const y2 = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
  
  if (x2 <= x1 || y2 <= y1) return 0; // No overlap
  
  const intersectionArea = (x2 - x1) * (y2 - y1);
  const rect1Area = rect1.width * rect1.height;
  
  return intersectionArea / rect1Area;
}

/**
 * Convert OpenCV Contour to Exact-Sided Polygon - Core Geometric Processing Function
 * 
 * PURPOSE: Transforms complex contours into clean polygons with user-specified vertex count
 * SIGNIFICANCE: Bridge between computer vision detection and precise geometric annotation
 * 
 * ALGORITHMIC STRATEGY:
 * 1. DOUGLAS-PEUCKER OPTIMIZATION: Tests multiple epsilon values for path simplification
 * 2. VERTEX MATCHING: Finds approximation closest to target side count
 * 3. INTELLIGENT ADJUSTMENT: Adds/removes vertices to achieve exact geometry
 * 
 * TECHNICAL DETAILS:
 * - Iterates through epsilon range: 0.005 to 0.1 of perimeter length
 * - Scores results by deviation from target vertex count
 * - Uses geometric interpolation for vertex insertion
 * - Applies distance-based vertex merging for reduction
 */
function convertToControlledPolygon(contour: any, targetSides: number, cv: any): number[] {
  try {
    console.log(`Converting to ${targetSides}-sided polygon`);

    // Start with Douglas-Peucker approximation at different epsilon values
    let bestPoints: Point[] = [];
    let bestDifference = Infinity;

    // Try multiple epsilon values to find one that gives us close to target sides
    const epsilonValues = [0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.1];
    
    for (const epsilonFactor of epsilonValues) {
      const approx = new cv.Mat();
      const epsilon = epsilonFactor * cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, epsilon, true);

      const numPoints = approx.total();
      const difference = Math.abs(numPoints - targetSides);

      if (difference < bestDifference) {
        bestDifference = difference;
        
        // Extract points
        const points: Point[] = [];
        for (let i = 0; i < numPoints; i++) {
          points.push({
            x: approx.data32S[i * 2],
            y: approx.data32S[i * 2 + 1]
          });
        }
        bestPoints = points;
      }
      approx.delete();
    }

    console.log(`Initial approximation: ${bestPoints.length} points (target: ${targetSides})`);

    // Now intelligently adjust to exact number of sides
    const finalPoints = adjustToExactSides(bestPoints, targetSides);
    
    console.log(`Final result: ${finalPoints.length} points`);

    // Convert to flat array
    return finalPoints.flatMap(p => [p.x, p.y]);
  } catch (error) {
    console.warn("Polygon conversion failed:", error);
    return [];
  }
}

/**
 * Intelligent Polygon Vertex Optimization for Exact Side Count
 * 
 * PURPOSE: Precisely adjusts vertex count through geometric analysis and optimization
 * SIGNIFICANCE: Ensures final polygon matches user's complexity requirements exactly
 * 
 * OPTIMIZATION STRATEGY:
 * 1. VERTEX REDUCTION: Removes least geometrically significant points first
 * 2. VERTEX INSERTION: Adds points at optimal edge midpoints for maximum shape preservation
 * 3. ITERATIVE REFINEMENT: Continues until exact target vertex count achieved
 * 
 * GEOMETRIC PRINCIPLES:
 * - Removal priority: Points with smallest angle deviation from straight lines
 * - Insertion strategy: Longest edge segments get new vertices first  
 * - Shape preservation: Maintains overall contour integrity during modification
 */
function adjustToExactSides(points: Point[], targetSides: number): Point[] {
  if (points.length === targetSides) return points;
  
  let workingPoints = [...points];
  
  // Remove excess vertices (choose least important ones)
  while (workingPoints.length > targetSides) {
    workingPoints = removeOptimalVertex(workingPoints);
  }
  
  // Add missing vertices (choose optimal positions)  
  while (workingPoints.length < targetSides) {
    workingPoints = addOptimalVertex(workingPoints);
  }
  
  return workingPoints;
}

/**
 * Geometric Vertex Removal Based on Shape Contribution Analysis
 * 
 * PURPOSE: Identifies and removes the vertex that least affects overall polygon shape
 * SIGNIFICANCE: Maintains shape fidelity while reducing geometric complexity
 * 
 * MATHEMATICAL APPROACH:
 * 1. ANGLE DEVIATION: Measures how much each vertex deviates from straight line
 * 2. DISTANCE IMPACT: Calculates perpendicular distance from point to adjacent edge
 * 3. IMPORTANCE SCORING: Combines angle × distance to quantify geometric significance
 * 
 * REMOVAL CRITERIA:
 * - Lower importance score = higher removal priority
 * - Preserves vertices that create significant shape features
 * - Maintains minimum triangle constraint (≥3 vertices)
 */
function removeOptimalVertex(points: Point[]): Point[] {
  if (points.length <= 3) return points;

  let minImportance = Infinity;
  let removeIndex = 0;

  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    // Calculate how much removing this point would change the shape
    const angle = calculateAngleDifference(prev, curr, next);
    const distance = pointToLineDistance(curr, prev, next);
    
    // Importance = how much the shape would change without this point
    const importance = angle * distance;
    
    if (importance < minImportance) {
      minImportance = importance;
      removeIndex = i;
    }
  }

  return points.filter((_, i) => i !== removeIndex);
}

/**
 * Optimal Vertex Insertion for Polygon Complexity Enhancement
 * 
 * PURPOSE: Adds new vertices at geometrically optimal positions for shape refinement
 * SIGNIFICANCE: Increases polygon detail while maintaining proportional accuracy
 * 
 * INSERTION STRATEGY:
 * 1. EDGE ANALYSIS: Measures length and curvature of all polygon edges
 * 2. BENEFIT CALCULATION: Identifies edges that would most benefit from subdivision
 * 3. MIDPOINT PLACEMENT: Inserts new vertex at geometric center of selected edge
 * 
 * OPTIMIZATION CRITERIA:
 * - Prioritizes longest edges for subdivision
 * - Considers local curvature for natural placement
 * - Maintains proportional geometric relationships
 */
function addOptimalVertex(points: Point[]): Point[] {
  if (points.length === 0) return points;

  let maxBenefit = 0;
  let bestPosition = 0;

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    
    // Calculate edge length and curvature
    const edgeLength = Math.hypot(next.x - curr.x, next.y - curr.y);
    
    // Benefit of subdivision = edge length (longer edges benefit more from subdivision)
    if (edgeLength > maxBenefit) {
      maxBenefit = edgeLength;
      bestPosition = i;
    }
  }

  // Add point at midpoint of best edge
  const curr = points[bestPosition];
  const next = points[(bestPosition + 1) % points.length];
  const newPoint = {
    x: Math.round((curr.x + next.x) / 2),
    y: Math.round((curr.y + next.y) / 2)
  };

  const result = [...points];
  result.splice(bestPosition + 1, 0, newPoint);
  return result;
}

/**
 * Vector Angle Analysis for Geometric Significance Assessment
 * 
 * PURPOSE: Quantifies angular change if middle vertex were removed from polygon
 * SIGNIFICANCE: Core metric for determining vertex geometric importance
 * 
 * MATHEMATICAL FOUNDATION:
 * 1. VECTOR CALCULATION: Computes direction vectors from adjacent vertices
 * 2. ANGLE COMPUTATION: Uses atan2 for precise angular measurements  
 * 3. DIFFERENCE ANALYSIS: Measures deviation from straight-line path
 * 
 * NORMALIZATION: Ensures angle differences stay within 0-π range for consistent comparison
 */
function calculateAngleDifference(a: Point, b: Point, c: Point): number {
  const angle1 = Math.atan2(b.y - a.y, b.x - a.x);
  const angle2 = Math.atan2(c.y - b.y, c.x - b.x);
  let diff = Math.abs(angle2 - angle1);
  
  // Normalize to 0-π range
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  
  return diff;
}

/**
 * Perpendicular Distance Calculation for Vertex Impact Assessment
 * 
 * PURPOSE: Measures how far a vertex deviates from the straight line between its neighbors
 * SIGNIFICANCE: Quantifies geometric impact of vertex removal on shape accuracy
 * 
 * MATHEMATICAL METHOD:
 * 1. VECTOR PROJECTION: Projects point-to-line vectors using dot product mathematics
 * 2. PERPENDICULAR COMPONENT: Isolates perpendicular distance using cross product
 * 3. NORMALIZATION: Divides by line length for scale-independent measurement
 * 
 * GEOMETRIC INTERPRETATION: Higher distance = more important vertex for shape preservation
 */
function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) return Math.hypot(A, B);
  
  const param = Math.max(0, Math.min(1, dot / lenSq));
  const projX = lineStart.x + param * C;
  const projY = lineStart.y + param * D;
  
  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * Convert contour to bounding box
 */
function convertToBoundingBox(contour: any, cv: any): number[] {
  const rect = cv.boundingRect(contour);
  return [rect.x, rect.y, rect.width, rect.height];
}

/**
 * Intelligent Path Simplification - Robust Fallback Algorithm
 * 
 * PURPOSE: Provides reliable polygon generation when computer vision methods fail
 * SIGNIFICANCE: Ensures system never fails to produce valid geometric output
 * 
 * ADAPTIVE APPROACH:
 * 1. DOUGLAS-PEUCKER BASE: Uses proven path simplification algorithm as foundation
 * 2. TOLERANCE ADAPTATION: Iteratively adjusts simplification parameters
 * 3. VERTEX CONTROL: Fine-tunes result to match exact target complexity
 * 
 * FALLBACK STRATEGY:
 * - Activates when CV methods cannot detect suitable objects
 * - Transforms user's drawn path into clean geometric representation
 * - Maintains user intent while providing professional annotation quality
 */
function intelligentPathSimplification(path: Point[], targetSides: number): number[] {
  console.log(`Applying intelligent path simplification: ${path.length} to ${targetSides} points`);
  
  if (path.length <= targetSides) {
    return path.flatMap(p => [p.x, p.y]);
  }
  
  // Use Douglas-Peucker with adaptive tolerance
  let tolerance = 1.0;
  let simplified = douglasPeuckerSimplify(path, tolerance);
  
  // Adjust tolerance to get closer to target
  while (simplified.length > targetSides && tolerance < 50) {
    tolerance *= 1.5;
    simplified = douglasPeuckerSimplify(path, tolerance);
  }
  
  // Fine-tune to exact count
  const finalPoints = adjustToExactSides(simplified, targetSides);
  return finalPoints.flatMap(p => [p.x, p.y]);
}

/**
 * Douglas-Peucker Line Simplification Algorithm - Classic Geometric Optimization
 * 
 * PURPOSE: Reduces path complexity while preserving essential geometric features
 * SIGNIFICANCE: Industry-standard algorithm for polyline simplification with proven mathematical foundation
 * 
 * RECURSIVE STRATEGY:
 * 1. FURTHEST POINT DETECTION: Finds point with maximum distance from start-end line
 * 2. TOLERANCE EVALUATION: Compares distance against simplification threshold  
 * 3. RECURSIVE SUBDIVISION: Splits path at significant points and processes segments
 * 
 * MATHEMATICAL PROPERTIES:
 * - Preserves topology and general shape characteristics
 * - Guarantees simplified path stays within tolerance bounds of original
 * - Optimal vertex selection for minimal information loss
 */
function douglasPeuckerSimplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  
  // Find the point with maximum distance from line between first and last
  let maxDist = 0;
  let index = 0;
  
  const start = points[0];
  const end = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToLineDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  
  if (maxDist > tolerance) {
    // Recursively simplify
    const left = douglasPeuckerSimplify(points.slice(0, index + 1), tolerance);
    const right = douglasPeuckerSimplify(points.slice(index), tolerance);
    
    // Combine results (remove duplicate middle point)
    return left.slice(0, -1).concat(right);
  } else {
    // Base case - line is simple enough
    return [start, end];
  }
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