import type { Area } from "react-easy-crop";

// Browser-only (canvas, Image) — used from the group-image cropper dialog
// before upload, never on the server.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = src;
  });
}

// Renders just the cropped pixel region onto an offscreen canvas and
// exports it as a Blob — the actual bytes we upload are the cropped
// result, not the original file plus CSS object-fit guesswork.
export async function getCroppedImageBlob(imageSrc: string, cropPixels: Area, mimeType: string): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropPixels.width);
  canvas.height = Math.round(cropPixels.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export cropped image."));
      },
      mimeType,
      0.92,
    );
  });
}
