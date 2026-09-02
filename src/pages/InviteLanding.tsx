/**
 * Landing on a private-event invite link.
 *
 * Two details here are load-bearing and both were learned the hard way:
 *
 *  1. The URL fragment is captured ONCE, on mount. A remote signer (bunker,
 *     nostrconnect) round-trips the page during login, and the fragment does
 *     not survive that. Plektos has a remote-login return route, so this is not
 *     hypothetical.
 *  2. `LoginArea` is mounted unconditionally, never inside `if (!user)`. Only
 *     the CTA copy changes. Wrapping it in a conditional is explicitly against
 *     this codebase's conventions.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Lock, PartyPopper } from "lucide-react";
import { toast } from "sonner";

import { LoginArea } from "@/components/auth/LoginArea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { parseInviteRoute } from "@/concord/lib/invite";
import { useInviteBundle, useRedeemInvite } from "@/hooks/private/useInvite";
import { usePrivateEvents } from "@/hooks/private/usePrivateEvent";

export function InviteLanding() {
  const { naddr } = useParams<{ naddr: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const redeem = useRedeemInvite();
  const { communities } = usePrivateEvents();

  // Captured once — a remote-signer login will otherwise eat it.
  const [fragment] = useState(() => window.location.hash.replace(/^#/, ""));

  const link = useMemo(() => {
    if (!naddr || !fragment) return undefined;
    try {
      return parseInviteRoute(naddr, fragment);
    } catch {
      return undefined;
    }
  }, [naddr, fragment]);

  const { data: bundle, isLoading, error } = useInviteBundle(link);

  const already = bundle && communities.some((c) => c.idHex === bundle.community_id);

  useEffect(() => {
    if (already && bundle) navigate(`/private/${bundle.community_id}`, { replace: true });
  }, [already, bundle, navigate]);

  const accept = async () => {
    if (!bundle) return;
    try {
      const cid = await redeem.mutateAsync(bundle);
      toast.success("You're on the list ✨");
      navigate(`/private/${cid}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't accept the invite");
    }
  };

  if (!link) {
    return (
      <Shell title="This invite link looks incomplete">
        <p className="text-muted-foreground">
          The secret part of an invite comes after the <code className="font-mono">#</code>.
          If you copied the link by hand, you may have left it off — ask the host to send the
          whole thing.
        </p>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell title="Opening your invite…">
        <Skeleton className="h-24 w-full rounded-2xl" />
      </Shell>
    );
  }

  if (error || !bundle) {
    return (
      <Shell title="This invite isn't available">
        <p className="text-muted-foreground">
          It may have been turned off, or it may have expired. Ask the host for a new link.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Tried: {link.bootstrapRelays.join(", ") || "the app's default relays"}
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="You're invited">
      <div className="rounded-3xl bg-party-gradient p-6 text-primary-foreground">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
          <Lock className="size-3" aria-hidden /> Private party
        </p>
        <h2 className="mt-3 font-title text-3xl font-bold leading-tight">{bundle.name}</h2>
        {bundle.description && <p className="mt-2 opacity-90">{bundle.description}</p>}
      </div>

      <Button
        className="mt-4 w-full bg-party-gradient"
        disabled={!user || redeem.isPending}
        onClick={accept}
      >
        {redeem.isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Adding you…
          </>
        ) : user ? (
          <>
            <PartyPopper className="mr-2 size-4" aria-hidden /> Accept invite
          </>
        ) : (
          "Sign in to accept"
        )}
      </Button>

      {/* Unconditionally mounted; only the CTA above changes with auth state. */}
      <div className="mt-4 flex justify-center">
        <LoginArea className="w-full" />
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-lg p-4 py-10">
      <h1 className="mb-4 font-display text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}
