"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/text";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageCropperDialog } from "@/components/ui/image-cropper-dialog";
import { Spinner } from "@/components/ui/spinner";

const ASPECT = 2 / 1;

export function GroupImageUploader({ groupId, initialImageUrl }: { groupId: string; initialImageUrl: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The file picked but not yet uploaded — held here while the cropper
  // dialog is open so we know the original mime type to export the crop
  // as, and to revoke the object URL once we're done with it either way.
  const [pendingFile, setPendingFile] = useState<{ src: string; type: string } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setPendingFile({ src: URL.createObjectURL(file), type: file.type });
  }

  function closeCropper() {
    if (pendingFile) URL.revokeObjectURL(pendingFile.src);
    setPendingFile(null);
  }

  async function handleCropConfirm(blob: Blob) {
    const type = pendingFile?.type ?? blob.type;
    closeCropper();

    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", new File([blob], `group-image.${type.split("/")[1] ?? "jpg"}`, { type }));
      const res = await fetch(`/api/groups/${groupId}/image`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to upload group image.");
        return;
      }
      setImageUrl(body.url);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await fetch(`/api/groups/${groupId}/image`, { method: "DELETE" });
      setImageUrl(null);
      router.refresh();
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-lg">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Vercel Blob URL, not worth an Image remotePatterns entry
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted">
            No image set
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Spinner className="h-5 w-5 text-accent" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" className="px-2.5 py-1 text-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {imageUrl ? "Change image" : "Upload image"}
        </Button>
        {imageUrl && (
          <Button type="button" variant="destructive-link" className="text-sm" onClick={() => setConfirmRemove(true)} disabled={uploading}>
            Remove
          </Button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
      {error && <ErrorText>{error}</ErrorText>}

      <ImageCropperDialog
        open={pendingFile !== null}
        imageSrc={pendingFile?.src ?? null}
        aspect={ASPECT}
        mimeType={pendingFile?.type ?? "image/jpeg"}
        onCancel={closeCropper}
        onConfirm={handleCropConfirm}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="Remove group image?"
        confirmLabel="Remove"
        loading={removing}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
