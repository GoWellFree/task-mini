export type AvatarSize = 24 | 28 | 32 | 40 | 48;

const SIZE_CLASSES: Record<AvatarSize, string> = {
  24: "h-6 w-6 text-[10px]",
  28: "h-7 w-7 text-[11px]",
  32: "h-8 w-8 text-xs",
  40: "h-10 w-10 text-sm",
  48: "h-12 w-12 text-base",
};

const PALETTE = ["#5b5fef", "#14b8a6", "#d97706", "#e0363b", "#2f7de1", "#8b5cf6", "#0d9488", "#db2777"];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

function initialsOf(firstName: string, lastName?: string | null): string {
  const a = firstName.trim().charAt(0);
  const b = lastName?.trim().charAt(0) ?? "";
  return (a + b).toUpperCase() || "?";
}

/**
 * PublicUser doesn't currently carry avatar_url (see TODO_BACKEND in the
 * NOVA redesign report), so `photoUrl` only ever fires from the current
 * user's own Telegram-provided profile where that's wired up — every other
 * avatar renders as initials, which is the documented real fallback, not a
 * placeholder.
 */
export function Avatar({
  firstName,
  lastName,
  photoUrl,
  size = 32,
  className = "",
}: {
  firstName: string;
  lastName?: string | null;
  photoUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const initials = initialsOf(firstName, lastName);

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${firstName} ${lastName ?? ""}`.trim()}
        className={`shrink-0 rounded-full object-cover ${SIZE_CLASSES[size]} ${className}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: colorFor(firstName + (lastName ?? "")) }}
      aria-label={`${firstName} ${lastName ?? ""}`.trim()}
    >
      {initials}
    </span>
  );
}

export function AvatarGroup({
  people,
  size = 28,
  max = 3,
}: {
  people: { firstName: string; lastName?: string | null; photoUrl?: string | null }[];
  size?: AvatarSize;
  max?: number;
}) {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((p, i) => (
        <Avatar
          key={i}
          firstName={p.firstName}
          lastName={p.lastName}
          photoUrl={p.photoUrl}
          size={size}
          className="ring-2 ring-surface-primary"
        />
      ))}
      {overflow > 0 && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-secondary font-semibold text-content-secondary ring-2 ring-surface-primary ${SIZE_CLASSES[size]}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
