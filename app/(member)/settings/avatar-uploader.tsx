"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/text";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImageCropperDialog } from "@/components/ui/image-cropper-dialog";
import { Spinner } from "@/components/ui/spinner";

export function AvatarUploader({ initialAvatarUrl, displayName }: { initialAvatarUrl: string | null; displayName: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The file picked but not yet uploaded — held here while the cropper
  // dialog is open, same pattern as GroupImageUploader.
  const [pendingFile, setPendingFile] = useState<{ src: string; type: string } | null>(null);

  const initial = (displayName ?? "?").trim().charAt(0).toUpperCase();

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
      form.append("avatar", new File([blob], `avatar.${type.split("/")[1] ?? "jpg"}`, { type }));
      const res = await fetch("/api/settings/avatar", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to upload profile picture.");
        return;
      }
      setAvatarUrl(body.url);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await fetch("/api/settings/avatar", { method: "DELETE" });
      setAvatarUrl(null);
      router.refresh();
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 flex-shrink-0">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Vercel Blob URL, not worth an Image remotePatterns entry
          <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10 text-2xl font-semibold text-accent">{initial}</div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Spinner className="h-5 w-5 text-accent" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {avatarUrl && (
            <Button type="button" variant="destructive-link" onClick={() => setConfirmRemove(true)} disabled={uploading}>
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
      </div>

      <ImageCropperDialog
        open={pendingFile !== null}
        imageSrc={pendingFile?.src ?? null}
        aspect={1}
        cropShape="round"
        mimeType={pendingFile?.type ?? "image/jpeg"}
        onCancel={closeCropper}
        onConfirm={handleCropConfirm}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="Remove profile picture?"
        confirmLabel="Remove"
        loading={removing}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
