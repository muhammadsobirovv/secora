// Drag-to-select overlay for "Selected Area" screenshots. Pure DOM/CSS,
// no dependency — draws a full-viewport semi-transparent layer, tracks
// mousedown->mousemove->mouseup to build a selection rectangle, then
// calls back with the rect in viewport (CSS pixel) coordinates. The
// caller (background, via `shared/screenshot.ts::cropSelection`) is
// responsible for converting to device pixels using the
// `devicePixelRatio` passed alongside the rect, since
// `captureVisibleTab` returns a device-pixel-resolution image.

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function startAreaSelection(onComplete: (rect: SelectionRect) => void): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.15);";
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;border:2px solid #6d5efc;background:rgba(109,94,252,0.15);pointer-events:none;";
  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;

  const update = (x: number, y: number) => {
    const left = Math.min(startX, x);
    const top = Math.min(startY, y);
    const width = Math.abs(x - startX);
    const height = Math.abs(y - startY);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  };

  const cleanup = () => {
    overlay.removeEventListener("mousedown", onMouseDown);
    overlay.removeEventListener("mousemove", onMouseMove);
    overlay.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };

  const onMouseDown = (e: MouseEvent) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    update(startX, startY);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    update(e.clientX, e.clientY);
  };
  const onMouseUp = (e: MouseEvent) => {
    if (!dragging) return;
    dragging = false;
    const rect: SelectionRect = {
      x: Math.min(startX, e.clientX),
      y: Math.min(startY, e.clientY),
      width: Math.abs(e.clientX - startX),
      height: Math.abs(e.clientY - startY),
    };
    cleanup();
    if (rect.width > 4 && rect.height > 4) onComplete(rect);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup();
  };

  overlay.addEventListener("mousedown", onMouseDown);
  overlay.addEventListener("mousemove", onMouseMove);
  overlay.addEventListener("mouseup", onMouseUp);
  document.addEventListener("keydown", onKeyDown);
}
