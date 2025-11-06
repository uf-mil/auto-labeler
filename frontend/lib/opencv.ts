// frontend/lib/opencv.ts
// Region processing + N-gon generation for labeling.
//
// IMPORTANT: The <img> passed to cv.imread(...) must be CORS-safe,
// otherwise the canvas will be tainted and pixel reads will fail.
// Example (react + use-image):
//   const [img] = useImage(src, 'anonymous');
// and ensure the image server returns Access-Control-Allow-Origin for your app.

declare global {
  interface Window {
    cv: any;
  }
}

type Point = { x: number; y: number };

/** Quick guard */
export function isOpenCVReady(): boolean {
  return typeof window !== "undefined" && typeof window.cv !== "undefined";
}

/**
 * Given a hand-drawn path around an object, return either:
 *  - a polygon with exactly `polygonSides` vertices (shapeMode === "polygon"), or
 *  - a rotated 4-vertex bbox (shapeMode === "bbox")
 *
 * Points are returned in IMAGE PIXELS as [x1,y1,x2,y2,...]
 * `drawnPath` is expected to be in image coordinates already (as in your CanvasStage).
 */
export async function processImageRegion(
  imageElement: HTMLImageElement,
  drawnPath: Point[],
  shapeMode: "polygon" | "bbox",
  polygonSides: number = 4,
  transform: { offsetX: number; offsetY: number; zoom: number } = {
    offsetX: 0,
    offsetY: 0,
    zoom: 1
  }
): Promise<number[]> {
  if (!isOpenCVReady()) {
    throw new Error("OpenCV is not loaded");
  }

  const cv = window.cv;
  const safePath = drawnPath || [];

  if (safePath.length < 3) {
    return simplifyPath(convertToImagePoints(safePath, transform));
  }

  // 1) Load image pixels and mask the user’s path
  const src = cv.imread(imageElement);
  const mask = createMaskFromPath(src, safePath, transform, cv);
  const masked = new cv.Mat();
  src.copyTo(masked, mask);

  // 2) Build a tight ROI around the user path (speeds up everything + better SNR)
  const pts = convertToImagePoints(safePath, transform);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  minX = Math.max(0, Math.floor(minX) - 4);
  minY = Math.max(0, Math.floor(minY) - 4);
  maxX = Math.min(masked.cols - 1, Math.ceil(maxX) + 4);
  maxY = Math.min(masked.rows - 1, Math.ceil(maxY) + 4);

  const roiRect = new cv.Rect(
    minX,
    minY,
    Math.max(1, maxX - minX + 1),
    Math.max(1, maxY - minY + 1)
  );
  const roi = masked.roi(roiRect);
  const roiMask = mask.roi(roiRect);

  try {
    // 3) Prepare k-means samples from pixels inside the ROI & inside the path mask
    //    Use RGB as features; no fragile color conversions.
    const mv = new cv.MatVector();
    cv.split(roi, mv);
    const ch = mv.size();

    let r: any, g: any, b: any;
    if (ch >= 3) {
      r = mv.get(0); g = mv.get(1); b = mv.get(2);
    } else {
      // single-channel fallback: duplicate to pretend RGB
      r = roi.clone(); g = roi.clone(); b = roi.clone();
    }
    mv.delete();

    const nonZero = new cv.Mat();
    cv.threshold(roiMask, nonZero, 0, 255, cv.THRESH_BINARY);

    // Sample every STRIDE pixels inside the mask (STRIDE=1 is fine for most images)
    const STRIDE = 1;
    const samplesArr: number[] = [];
    for (let y = 0; y < roi.rows; y += STRIDE) {
      const mRow = nonZero.ucharPtr(y);
      const rRow = r.ucharPtr(y), gRow = g.ucharPtr(y), bRow = b.ucharPtr(y);
      for (let x = 0; x < roi.cols; x += STRIDE) {
        if (mRow[x] > 0) {
          samplesArr.push(rRow[x], gRow[x], bRow[x]);
        }
      }
    }

    // Guard: if nothing to segment, fallback to sketch simplification
    if (samplesArr.length === 0) {
      r.delete(); g.delete(); b.delete(); nonZero.delete();
      return simplifyPath(convertToImagePoints(safePath, transform));
    }

    // 4) K-means segmentation (K=3 works well across varied scenes)
    const K = 3;
    const samples = cv.matFromArray(samplesArr.length / 3, 3, cv.CV_32F, samplesArr);
    const labels = new cv.Mat();
    const centers = new cv.Mat();
    const criteria = new cv.TermCriteria(
      cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER,
      20,
      1.0
    );
    cv.kmeans(samples, K, labels, criteria, 3, cv.KMEANS_PP_CENTERS, centers);

    // 5) Choose the cluster most likely to be the object:
    //    default heuristic = darkest center (works well for eyes/holes/inner parts).
    const centerVals: number[] = [];
    for (let k = 0; k < K; k++) {
      const R = centers.floatAt(k, 0);
      const G = centers.floatAt(k, 1);
      const B = centers.floatAt(k, 2);
      centerVals.push(Math.max(R, G, B)); // brightness proxy
    }
    let chosenIdx = 0, minVal = Infinity;
    for (let k = 0; k < K; k++) {
      if (centerVals[k] < minVal) { minVal = centerVals[k]; chosenIdx = k; }
    }

    // 6) Build a binary mask for the chosen cluster in ROI space
    const binRoi = cv.Mat.zeros(roi.rows, roi.cols, cv.CV_8UC1);
    let writeIdx = 0;
    for (let y = 0; y < roi.rows; y += STRIDE) {
      const mRow = nonZero.ucharPtr(y);
      const outRow = binRoi.ucharPtr(y);
      for (let x = 0; x < roi.cols; x += STRIDE) {
        if (mRow[x] > 0) {
          const lbl = labels.intAt(writeIdx, 0);
          if (lbl === chosenIdx) outRow[x] = 255;
          writeIdx++;
        }
      }
    }

    // 7) Clean mask + bias inward slightly so the polygon “hugs” the object
    const k3 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.morphologyEx(binRoi, binRoi, cv.MORPH_CLOSE, k3, new cv.Point(-1, -1), 1);
    //cv.erode(binRoi, binRoi, k3, new cv.Point(-1, -1), 1);

    // 8) Find contours (in ROI coords), score them, and pick the best
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binRoi, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

    const centerImg = polygonCentroid(pts);
    let bestIdx = -1, bestScore = -1;

    // Weights you can tweak
    const W_DARK = 0.6; // prefer darker interiors (good for irises/holes)
    const W_EDGE = 0.25; // prefer compact shapes (low perimeter/area)
    const W_NEAR = 0.15; // prefer near user-drawn center

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt, false);
      if (area < 10) continue;

      // Darkness inside this contour (using max(r,g,b) as brightness)
      const cntMask = cv.Mat.zeros(binRoi.rows, binRoi.cols, cv.CV_8UC1);
      const one = new cv.MatVector(); one.push_back(cnt);
      cv.fillPoly(cntMask, one, new cv.Scalar(255, 255, 255, 255));
      one.delete();

      let sumV = 0, countV = 0;
      for (let y = 0; y < roi.rows; y++) {
        const mrow = cntMask.ucharPtr(y);
        const rr = r.ucharPtr(y), gg = g.ucharPtr(y), bb = b.ucharPtr(y);
        for (let x = 0; x < roi.cols; x++) {
          if (mrow[x]) { sumV += Math.max(rr[x], gg[x], bb[x]); countV++; }
        }
      }
      const meanV = countV ? sumV / countV : 255;
      const darkScore = (255 - meanV) / 255.0;

      // Compactness
      const perim = cv.arcLength(cnt, true);
      const comp = perim / Math.max(area, 1);
      const edgeScore = Math.max(0, Math.min(1, 1.0 - comp / 0.35));

      // Proximity to user center (converted to image coords)
      const m = cv.moments(cnt, false);
      const cx = m.m00 ? m.m10 / m.m00 : roi.cols / 2;
      const cy = m.m00 ? m.m01 / m.m00 : roi.rows / 2;
      const cxImg = cx + roiRect.x, cyImg = cy + roiRect.y;
      const dist = Math.hypot(cxImg - centerImg.x, cyImg - centerImg.y);
      const diag = Math.hypot(masked.cols, masked.rows);
      const nearScore = Math.max(0, 1 - dist / (0.2 * diag));

      const score = W_DARK * darkScore + W_EDGE * edgeScore + W_NEAR * nearScore;
      if (score > bestScore) { bestScore = score; bestIdx = i; }

      cntMask.delete();
    }

    // 9) Convert best contour to final shape and return (in IMAGE coords)
    let out: number[] = [];
    if (bestIdx >= 0) {
      const best = contours.get(bestIdx);

      if (shapeMode === "polygon") {
        const outRoi = approximateToExactSides(best, polygonSides, cv); // ROI coords
        out = offsetFlatPoints(outRoi, roiRect.x, roiRect.y);          // → IMAGE coords
      } else {
        const outRoi = createBoundingBox(best, cv); // ROI coords
        out = offsetFlatPoints(outRoi, roiRect.x, roiRect.y); // → IMAGE coords
      }
    } 
    else{
      // fallback already returns IMAGE coords
      out = simplifyPath(convertToImagePoints(safePath, transform));
    }


    // Cleanup (allocated in try block)
    samples.delete(); labels.delete(); centers.delete();
    // criteria is NOT a Mat in OpenCV.js → no delete()
    nonZero.delete(); r.delete(); g.delete(); b.delete();
    binRoi.delete(); k3.delete(); contours.delete(); hierarchy.delete();

    // Global cleanup
    src.delete(); mask.delete(); masked.delete(); roi.delete(); roiMask.delete();

    return out;
  } catch (err) {
    console.error("Error processing image region:", err);

    // Cleanup on error
    roi.delete(); roiMask.delete();
    src.delete(); mask.delete(); masked.delete();

    return simplifyPath(convertToImagePoints(safePath, transform));
  }
}

/* ------------------------------ Helpers ------------------------------ */

/** Fill polygon mask from path points (image coords in, 8UC1 out) */
function createMaskFromPath(
  src: any,
  path: Point[],
  transform: { offsetX: number; offsetY: number; zoom: number },
  cv: any
): any {
  const mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

  const imgPts = convertToImagePoints(path, transform).map((p) => ({
    x: Math.max(0, Math.min(src.cols - 1, Math.round(p.x))),
    y: Math.max(0, Math.min(src.rows - 1, Math.round(p.y))),
  }));

  if (imgPts.length < 3) return mask;

  const flat = imgPts.flatMap((p) => [p.x, p.y]);
  const ptsMat = cv.matFromArray(imgPts.length, 1, cv.CV_32SC2, flat);

  const contours = new cv.MatVector();
  contours.push_back(ptsMat);
  cv.fillPoly(mask, contours, new cv.Scalar(255, 255, 255, 255));

  ptsMat.delete(); contours.delete();
  return mask;
}

/** If the path is already in image coords, this is essentially a no-op */
function convertToImagePoints(
  path: Point[],
  transform: { offsetX: number; offsetY: number; zoom: number }
): Point[] {
  const { offsetX, offsetY, zoom } = transform;
  return path.map((p) => ({
    x: (p.x - offsetX) / zoom,
    y: (p.y - offsetY) / zoom,
  }));
}

/** Rotated min-area rectangle → 4 clockwise points (as flat array) */
function createBoundingBox(contour: any, cv: any): number[] {
  const rect = cv.minAreaRect(contour);
  const verts = cv.RotatedRect.points(rect); // 4 points
  const pts: Point[] = [];
  for (let i = 0; i < 4; i++) {
    pts.push({ x: Math.round(verts[i].x), y: Math.round(verts[i].y) });
  }
  const cw = orderClockwise(pts);
  return cw.flatMap((p) => [p.x, p.y]);
}

/** Approximate a contour to exactly N vertices (stable polygon) */
function approximateToExactSides(contour: any, targetSides: number, cv: any): number[] {
  const peri = cv.arcLength(contour, true);

  let lo = 0.0;
  let hi = 0.35 * peri;
  let best: { pts: Point[]; diff: number; eps: number } = { pts: [], diff: Infinity, eps: 0 };

  for (let iter = 0; iter < 16; iter++) {
    const eps = (lo + hi) / 2;
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, eps, true);
    const pts = matToPoints(approx);
    const diff = Math.abs(pts.length - targetSides);
    if (diff < best.diff) best = { pts, diff, eps };

    if (pts.length > targetSides) lo = eps;       // too detailed → simplify more
    else if (pts.length < targetSides) hi = eps;  // too simple → simplify less
    else {
      const ordered = orderClockwise(pts);
      approx.delete();
      return ordered.flatMap((p) => [p.x, p.y]);
    }
    approx.delete();
  }

  // Local refinement around best epsilon
  for (const m of [0.75, 0.9, 1.1, 1.25]) {
    const eps = Math.min(hi, Math.max(lo, best.eps * m));
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, eps, true);
    const pts = matToPoints(approx);
    const diff = Math.abs(pts.length - targetSides);
    if (diff < best.diff) best = { pts, diff, eps };
    approx.delete();
  }

  // Force exact N by removing/adding corners
  let pts = orderClockwise(best.pts);
  if (pts.length > targetSides) {
    while (pts.length > targetSides) pts = removeLeastSignificantCorner(pts);
  } else if (pts.length < targetSides) {
    while (pts.length < targetSides) pts = splitLongestEdge(pts);
  }

  return pts.flatMap((p) => [p.x, p.y]);
}

/** Nx1 CV_32SC2 → Point[] */
function matToPoints(mat: any): Point[] {
  const out: Point[] = [];
  const n = mat.total();
  for (let i = 0; i < n; i++) {
    out.push({ x: mat.data32S[i * 2], y: mat.data32S[i * 2 + 1] });
  }
  return out;
}

/** Clockwise ordering by angle about centroid */
function orderClockwise(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts.slice();
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
}

/** Remove the least “corner-y” vertex (angle closest to 180°) */
function removeLeastSignificantCorner(points: Point[]): Point[] {
  if (points.length <= 3) return points;
  let bestIdx = 0, bestSig = Infinity;
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const ang = angleDeg(prev, curr, next);
    const sig = Math.abs(180 - ang);
    if (sig < bestSig) { bestSig = sig; bestIdx = i; }
  }
  const res = points.slice();
  res.splice(bestIdx, 1);
  return res;
}

/** Insert a midpoint on the longest edge */
function splitLongestEdge(points: Point[]): Point[] {
  if (points.length === 0) return points;
  let bestIdx = 0, bestLen = -1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > bestLen) { bestLen = d; bestIdx = i; }
  }
  const a = points[bestIdx], b = points[(bestIdx + 1) % points.length];
  const mid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  const res = points.slice();
  res.splice(bestIdx + 1, 0, mid);
  return res;
}

/** Angle at B in degrees */
function angleDeg(a: Point, b: Point, c: Point): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.hypot(ba.x, ba.y);
  const magBC = Math.hypot(bc.x, bc.y);
  if (magBA === 0 || magBC === 0) return 180;
  const cos = dot / (magBA * magBC);
  const clamped = Math.max(-1, Math.min(1, cos));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/** Simple fallback: thin out a path to ~3–4 vertices */
function simplifyPath(pathImageSpace: Point[]): number[] {
  if (!pathImageSpace || pathImageSpace.length === 0) return [];
  const targetPoints = Math.min(4, Math.max(3, pathImageSpace.length));
  const step = Math.max(1, Math.floor(pathImageSpace.length / targetPoints));
  const simplified: number[] = [];
  for (let i = 0; i < pathImageSpace.length; i += step) {
    simplified.push(Math.round(pathImageSpace[i].x), Math.round(pathImageSpace[i].y));
  }
  return simplified;
}

/* ------------------------------ Converters ------------------------------ */

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

/** Simple centroid for a set of points */
function polygonCentroid(pts: Point[]): Point {
  if (!pts.length) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  return { x: sx / pts.length, y: sy / pts.length };
}

function offsetFlatPoints(pts: number[], dx: number, dy: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    out.push(pts[i] + dx, pts[i + 1] + dy);
  }
  return out;
}

