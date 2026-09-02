/**
 * Public or private, chosen on the vibe step.
 *
 * Not a third step and not a separate route: the poster IS the invitation, and
 * every styling control below applies to both modes unchanged. Private *adds*
 * a lock to the poster; it never takes the design away.
 *
 * The NIP-44 check happens here, at the moment of choosing, rather than at
 * publish time. A host who picks "private", fills in a whole party and only
 * then learns their signer can't encrypt has wasted real effort.
 */
import { Globe, Lock } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function PrivacySelector({
  isPrivate,
  onChange,
}: {
  isPrivate: boolean;
  onChange: (isPrivate: boolean) => void;
}) {
  const { user } = useCurrentUser();
  const canEncrypt = Boolean(user?.signer.nip44);

  return (
    <div className="space-y-3">
      <Label className="text-lg font-semibold">Who's this for?</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={!isPrivate}
          className={cn(
            "flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all",
            !isPrivate ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30",
          )}
        >
          <Globe className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="block font-semibold">🌍 Public party</span>
            <span className="block text-sm text-muted-foreground">
              Anyone can find it on Plektos.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => canEncrypt && onChange(true)}
          aria-pressed={isPrivate}
          disabled={!canEncrypt}
          className={cn(
            "flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all",
            isPrivate ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30",
            !canEncrypt && "cursor-not-allowed opacity-60 hover:border-muted",
          )}
        >
          <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="block font-semibold">🔒 Private party</span>
            <span className="block text-sm text-muted-foreground">
              Invite only. Encrypted guest list.
            </span>
          </span>
        </button>
      </div>

      {!canEncrypt && (
        <p className="text-sm text-muted-foreground">
          Your signer can't encrypt yet (it needs NIP-44), so private parties aren't available
          on this login. Try signing in a different way, or make this one public.
        </p>
      )}

      {isPrivate && canEncrypt && (
        // Stated up front rather than buried: the honest limit, at the moment
        // the host is deciding how much to trust this.
        <p className="text-sm text-muted-foreground">
          Encrypted for your guests. Relays can still see that something is happening — just
          not what, where, or who's coming.
        </p>
      )}
    </div>
  );
}
