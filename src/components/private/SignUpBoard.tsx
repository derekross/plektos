/**
 * The sign-up board, as a poster section.
 *
 * Category chips are kept from the app this came from — genuinely better than
 * a dropdown on a phone — but its per-category rainbow gradients are dropped.
 * A hash-assigned rainbow fights the host's chosen theme, and the theme is the
 * whole product here; letting `--primary` carry the colour means a Neon Noir
 * party gets a Neon Noir board.
 */
import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PosterSection } from "@/components/PosterSection";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthorsMetadata } from "@/hooks/useAuthorsMetadata";
import { usePrivateSignUpBoard } from "@/hooks/private/usePrivateSignUpBoard";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "food", emoji: "🥘", label: "Food" },
  { key: "drinks", emoji: "🥤", label: "Drinks" },
  { key: "dessert", emoji: "🍰", label: "Dessert" },
  { key: "supplies", emoji: "🧺", label: "Supplies" },
  { key: "other", emoji: "✨", label: "Other" },
];

export function SignUpBoard({ communityId }: { communityId: string }) {
  const { user } = useCurrentUser();
  const { items, addItem, setClaim } = usePrivateSignUpBoard(communityId);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("food");
  const [busy, setBusy] = useState<string>();

  const claimers = items.map((i) => i.claimedBy).filter((p): p is string => Boolean(p));
  const { data: profiles } = useAuthorsMetadata(claimers);

  const claimed = items.filter((i) => i.claimedBy).length;

  const add = async () => {
    if (!name.trim()) return;
    setBusy("add");
    try {
      await addItem(name.trim(), category);
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that");
    } finally {
      setBusy(undefined);
    }
  };

  const toggle = async (id: string, claim: boolean) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setBusy(id);
    try {
      await setClaim(item, claim);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update that");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <PosterSection title="Bringing 📝">
      {items.length > 0 && (
        <>
          <p className="mb-1 text-sm text-muted-foreground">
            {claimed} of {items.length} claimed
          </p>
          <div className="woven-line mb-4" />
        </>
      )}

      {user && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                aria-pressed={category === c.key}
                className={cn(
                  "rounded-full px-3 py-1 text-sm transition-colors",
                  category === c.key
                    ? "bg-party-gradient text-primary-foreground"
                    : "bg-muted hover:bg-muted/70",
                )}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="What should someone bring?"
              className="rounded-xl"
            />
            <Button onClick={add} disabled={busy === "add" || !name.trim()} className="bg-party-gradient">
              {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing on the board yet. What should people bring? 🥘
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const cat = CATEGORIES.find((c) => c.key === item.category);
            const mine = item.claimedBy === user?.pubkey;
            const claimerName =
              item.claimedBy &&
              (profiles?.[item.claimedBy]?.display_name ||
                profiles?.[item.claimedBy]?.name ||
                `${item.claimedBy.slice(0, 8)}…`);
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
                <span aria-hidden className="text-lg">{cat?.emoji ?? "✨"}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", item.claimedBy && "line-through opacity-70")}>
                    {item.name}
                  </span>
                  {item.claimedBy && (
                    <span className="block truncate text-xs text-green-600 dark:text-green-400">
                      ✓ {mine ? "You've got this" : `${claimerName} is bringing it`}
                    </span>
                  )}
                </span>
                {user && (!item.claimedBy || mine) && (
                  <Button
                    size="sm"
                    variant={mine ? "ghost" : "secondary"}
                    disabled={busy === item.id}
                    onClick={() => toggle(item.id, !mine)}
                  >
                    {busy === item.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : mine ? (
                      "Unclaim"
                    ) : (
                      <>
                        <Check className="mr-1 size-4" /> I'll bring it
                      </>
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PosterSection>
  );
}
