/**
 * Who's coming — named, not just faces.
 *
 * The public event page shows RSVPs as a stack of overlapping avatars, which
 * is right when attendance is a signal. For a private party the guest list IS
 * the point, so this renders names, grouped by status, viewer first.
 */
import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuthorsMetadata } from "@/hooks/useAuthorsMetadata";
import type { RsvpEntry, RsvpTally } from "@/lib/private/calendar";

const GROUPS: { key: keyof Pick<RsvpTally, "accepted" | "tentative" | "declined">; emoji: string; label: string }[] = [
  { key: "accepted", emoji: "✨", label: "Going" },
  { key: "tentative", emoji: "🤔", label: "Maybe" },
  { key: "declined", emoji: "😢", label: "Can't go" },
];

function GuestRow({
  entry,
  isViewer,
  profile,
}: {
  entry: RsvpEntry;
  isViewer: boolean;
  profile?: { name?: string; display_name?: string; picture?: string };
}) {
  const name = isViewer
    ? "You"
    : profile?.display_name || profile?.name || `${entry.pubkey.slice(0, 8)}…`;
  const npub = nip19.npubEncode(entry.pubkey);

  return (
    <Link
      to={`/profile/${npub}`}
      className="flex min-w-0 items-center gap-2 rounded-full bg-muted/60 py-1 pl-1 pr-3 transition-colors hover:bg-muted"
    >
      <Avatar className="size-6 shrink-0">
        <AvatarImage src={profile?.picture} alt="" loading="lazy" />
        <AvatarFallback className="text-[10px]">{name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm">{name}</span>
      {entry.guests > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">+{entry.guests}</span>
      )}
    </Link>
  );
}

export function GuestRoster({
  tally,
  viewerPubkey,
}: {
  tally: RsvpTally;
  viewerPubkey?: string;
}) {
  const pubkeys = GROUPS.flatMap((g) => tally[g.key].map((e) => e.pubkey));
  // One batched metadata fetch for the whole roster, not one per row.
  const { data: profiles } = useAuthorsMetadata(pubkeys);

  if (pubkeys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody's replied yet. Share the invite to get the first yes ✨
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const entries = tally[group.key];
        if (entries.length === 0) return null;

        // Viewer first, so people find themselves without scanning.
        const ordered = viewerPubkey
          ? [...entries].sort((a, b) =>
              a.pubkey === viewerPubkey ? -1 : b.pubkey === viewerPubkey ? 1 : 0,
            )
          : entries;

        return (
          <div key={group.key}>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <span aria-hidden>{group.emoji}</span> {group.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {entries.length} {entries.length === 1 ? "person" : "people"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ordered.map((entry) => (
                <GuestRow
                  key={entry.pubkey}
                  entry={entry}
                  isViewer={entry.pubkey === viewerPubkey}
                  profile={profiles?.[entry.pubkey]}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
