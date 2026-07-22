// Screenshot System — runs in the background service worker (only
// background scripts can call `chrome.tabs.captureVisibleTab`).
// `OffscreenCanvas` (used for cropping/stitching/blur) has been
// available in Chrome/Edge/Brave/Opera service workers since Chrome 105
// (2022) — see the Browser Extension Guide for the Firefox caveat (MV3
// event pages in Firefox behave more like a regular page than a true
// service worker, so `OffscreenCanvas` support there tracks the desktop
// build's Firefox version, not this API's Chrome-specific rollout; this
// is called out explicitly since it's the one place cross-browser
// behavior isn't guaranteed identical).

export interface CapturedScreenshot {
  dataUrl: string; // "data:image/png;base64,..."
  width: number;
  height: number;
  sha256: string;
}

export async function captureViewport(windowId: number): Promise<CapturedScreenshot> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  return toResult(dataUrl);
}

/**
 * Full-page capture: the caller (background message handler) is expected
 * to have already told the content script to report `document.body
 * .scrollHeight` / `window.innerHeight` and to scroll the page between
 * calls — this function just captures+stitches each already-scrolled-to
 * slice it's given, since `captureVisibleTab` only ever sees the current
 * scroll position and scrolling itself must happen in the page's own
 * context (a content script), not here.
 */
export async function stitchSlices(slices: Array<{ dataUrl: string; yOffset: number }>, totalWidth: number, totalHeight: number): Promise<CapturedScreenshot> {
  const canvas = new OffscreenCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");

  for (const slice of slices) {
    const bitmap = await dataUrlToBitmap(slice.dataUrl);
    ctx.drawImage(bitmap, 0, slice.yOffset);
  }

  return canvasToResult(canvas);
}

export async function cropSelection(dataUrl: string, rect: { x: number; y: number; width: number; height: number }): Promise<CapturedScreenshot> {
  const bitmap = await dataUrlToBitmap(dataUrl);
  const canvas = new OffscreenCanvas(rect.width, rect.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvasToResult(canvas);
}

/**
 * Blurs the given rectangles (sensitive regions the user marked, e.g. an
 * API key visible in a screenshot) via a simple box-blur pass — good
 * enough to make text unreadable without pulling in an image-processing
 * library for one feature.
 */
export async function blurRegions(dataUrl: string, regions: Array<{ x: number; y: number; width: number; height: number }>): Promise<CapturedScreenshot> {
  const bitmap = await dataUrlToBitmap(dataUrl);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);

  for (const r of regions) {
    const imageData = ctx.getImageData(r.x, r.y, r.width, r.height);
    boxBlur(imageData, 8);
    ctx.putImageData(imageData, r.x, r.y);
  }

  return canvasToResult(canvas);
}

/** Draws simple rectangle/arrow/text annotations onto a screenshot. */
export interface Annotation {
  kind: "rect" | "arrow" | "text";
  x: number;
  y: number;
  width?: number;
  height?: number;
  toX?: number; // arrow end point
  toY?: number;
  text?: string;
  color?: string;
}

export async function annotate(dataUrl: string, annotations: Annotation[]): Promise<CapturedScreenshot> {
  const bitmap = await dataUrlToBitmap(dataUrl);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);

  for (const a of annotations) {
    ctx.strokeStyle = a.color ?? "#ff3b30";
    ctx.fillStyle = a.color ?? "#ff3b30";
    ctx.lineWidth = 3;
    if (a.kind === "rect" && a.width && a.height) {
      ctx.strokeRect(a.x, a.y, a.width, a.height);
    } else if (a.kind === "arrow" && a.toX !== undefined && a.toY !== undefined) {
      drawArrow(ctx, a.x, a.y, a.toX, a.toY);
    } else if (a.kind === "text" && a.text) {
      ctx.font = "16px sans-serif";
      ctx.fillText(a.text, a.x, a.y);
    }
  }

  return canvasToResult(canvas);
}

// ---------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------

async function dataUrlToBitmap(dataUrl: string): Promise<ImageBitmap> {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

async function toResult(dataUrl: string): Promise<CapturedScreenshot> {
  const bitmap = await dataUrlToBitmap(dataUrl);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  return canvasToResult(canvas);
}

async function canvasToResult(canvas: OffscreenCanvas): Promise<CapturedScreenshot> {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const buffer = await blob.arrayBuffer();
  const sha256 = await sha256HexLocal(buffer);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, width: canvas.width, height: canvas.height, sha256 };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(binary)}`;
}

async function sha256HexLocal(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function drawArrow(ctx: OffscreenCanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 12;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

// Simple, dependency-free box blur (separable, single pass) — not
// photographic quality but sufficient to make redacted text unreadable.
function boxBlur(imageData: ImageData, radius: number) {
  const { data, width, height } = imageData;
  const copy = new Uint8ClampedArray(data);
  const kernelSize = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        const sy = y + ky;
        if (sy < 0 || sy >= height) continue;
        for (let kx = -radius; kx <= radius; kx++) {
          const sx = x + kx;
          if (sx < 0 || sx >= width) continue;
          const idx = (sy * width + sx) * 4;
          r += copy[idx];
          g += copy[idx + 1];
          b += copy[idx + 2];
          a += copy[idx + 3];
          count++;
        }
      }
      const idx = (y * width + x) * 4;
      data[idx] = r / count;
      data[idx + 1] = g / count;
      data[idx + 2] = b / count;
      data[idx + 3] = a / count;
    }
  }
  void kernelSize;
}
