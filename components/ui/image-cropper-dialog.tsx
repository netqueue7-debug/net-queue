"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/text";
import { getCroppedImageBlob } from "@/lib/image-crop";

interface DialogProps {
  imageSrc: string;
  aspect: number;
  mimeType: string;
  cropShape: "rect" | "round";
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

// Split so `key={imageSrc}` on the wrapper forces a fresh mount (and thus
// fresh crop/zoom state) whenever a new image is presented, instead of an
// effect resetting state on prop change (react-hooks/set-state-in-effect).
function CropperDialogContent({ imageSrc, aspect, mimeType, cropShape, onCancel, onConfirm }: DialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setError(null);
    setLoading(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, mimeType);
      onConfirm(blob);
    } catch {
      setError("Failed to crop image. Try a different file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-border bg-background p-5 shadow-lg">
        <h2 className="font-medium">Position your image</h2>

        <div className="relative h-96 w-full overflow-hidden rounded-lg bg-surface">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={loading} disabled={!croppedAreaPixels}>
            Use this crop
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ImageCropperDialog({
  open,
  imageSrc,
  aspect,
  mimeType,
  cropShape = "rect",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  imageSrc: string | null;
  aspect: number;
  mimeType: string;
  cropShape?: "rect" | "round";
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  if (!open || !imageSrc) return null;
  return (
    <CropperDialogContent
      key={imageSrc}
      imageSrc={imageSrc}
      aspect={aspect}
      mimeType={mimeType}
      cropShape={cropShape}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
