import type { ReactNode } from "react";

const SIZE_CLASSES = {
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10 text-base",
} as const;

// The small circular identicon — used only for the no-image fallback now
// (see GroupCardHeader below), kept exported in case a compact context
// ever needs just the circle with no header row around it.
export function GroupAvatar({
  name,
  imageUrl,
  size = "md",
}: {
  name: string;
  imageUrl: string | null;
  size?: keyof typeof SIZE_CLASSES;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Vercel Blob URL, not worth an Image remotePatterns entry
      <img src={imageUrl} alt="" className={`${SIZE_CLASSES[size]} flex-shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <span
      className={`flex ${SIZE_CLASSES[size]} flex-shrink-0 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent`}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

// A group card's header: once a group has an uploaded image, it gets the
// same wide 2:1 banner treatment as the About page — full card width,
// above the name — instead of a small circle inline with the text. A
// group with no image keeps the original compact row (small circle +
// name + badge), unchanged.
export function GroupCardHeader({
  name,
  imageUrl,
  badge,
  size = "md",
}: {
  name: string;
  imageUrl: string | null;
  badge: ReactNode;
  size?: keyof typeof SIZE_CLASSES;
}) {
  if (imageUrl) {
    return (
      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- external Vercel Blob URL, not worth an Image remotePatterns entry */}
        <img src={imageUrl} alt="" className="aspect-[2/1] w-full rounded-lg object-cover" />
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{name}</span>
          {badge}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <GroupAvatar name={name} imageUrl={null} size={size} />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate font-medium">{name}</span>
        {badge}
      </div>
    </div>
  );
}
