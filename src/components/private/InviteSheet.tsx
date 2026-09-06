/**
 * Sharing a private event.
 *
 * QR first, deliberately: the common case for a house party is showing someone
 * your phone. Copy and share follow for the remote case.
 *
 * This used to mint a fresh single-use keypair and publish a new bundle on
 * every open, each granting full access forever, with no way to see or withdraw
 * them. It now reuses the party's current live link, shows when it stops
 * working, and lets the host turn any of them off.
 */
import { useEffect, useMemo, useState } from "react";
import QRCodeLib from "qrcode";
import { Check, Copy, Loader2, Plus, QrCode, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Community } from "@/concord/lib/types";
import { useMintInvite, useRevokeInvite } from "@/hooks/private/useInvite";
import { useInviteList } from "@/hooks/private/useInviteList";
import { liveInvitesFor, toBundleMs } from "@/lib/private/inviteList";

function expiryLabel(expiresAtSeconds: number | undefined): string {
  if (expiresAtSeconds === undefined) return "Never expires";
  const days = Math.ceil((toBundleMs(expiresAtSeconds) - Date.now()) / 86_400_000);
  if (days <= 0) return "Expired";
  if (days === 1) return "Stops working tomorrow";
  return `Stops working in ${days} days`;
}

export function InviteSheet({
  community,
  channelIdHex,
  eventEndsMs,
  open,
  onOpenChange,
}: {
  community: Community;
  /** The one party being shared — an invite must never carry the others. */
  channelIdHex: string;
  /** End of the party, so a link outlives it instead of the date it was made. */
  eventEndsMs?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mint = useMintInvite();
  const revoke = useRevokeInvite();
  const { data: invites, isLoading } = useInviteList();
  const [qr, setQr] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [minting, setMinting] = useState(false);

  const live = useMemo(
    () => (invites ? liveInvitesFor(invites.list, channelIdHex, Date.now()) : []),
    [invites, channelIdHex],
  );
  const current = live[0];
  const url = current?.url;

  // Mint only when the party genuinely has no live link — never merely because
  // the sheet opened. The old behaviour scattered a fresh permanent key on
  // every visit, and `decryptFailed` blocks it too: minting while the existing
  // list is unreadable would leave those links working and unrevocable.
  useEffect(() => {
    if (!open || isLoading || current || minting || invites?.decryptFailed) return;
    setMinting(true);
    mint
      .mutateAsync({ community, channelIdHex, eventEndsMs })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't create an invite link"),
      )
      .finally(() => setMinting(false));
    // `mint` is a new object every render; depending on it would re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    isLoading,
    current,
    minting,
    invites?.decryptFailed,
    community,
    channelIdHex,
    eventEndsMs,
  ]);

  useEffect(() => {
    if (!url) return;
    QRCodeLib.toDataURL(url, { width: 256, margin: 2 }).then(setQr).catch(() => setQr(undefined));
  }, [url]);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast.success("Invite link copied");
  };

  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // User dismissed the sheet — fall through to clipboard.
      }
    }
    await copy();
  };

  const makeAnother = () => {
    setMinting(true);
    mint
      .mutateAsync({ community, channelIdHex, eventEndsMs })
      .then(() => toast.success("New invite link created"))
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't create an invite link"),
      )
      .finally(() => setMinting(false));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <QrCode className="size-5" aria-hidden /> Invite people
          </SheetTitle>
          <SheetDescription>
            Anyone with this link can see the party and RSVP.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {invites?.decryptFailed ? (
            <p className="rounded-2xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
              Your existing invite links couldn't be decrypted with this signer. Making a new one
              here would leave the old ones working and impossible to turn off, so nothing has
              been changed. Try the signer you used to create this party.
            </p>
          ) : !url ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              {minting ? "Creating your invite…" : "Looking for your invite…"}
            </div>
          ) : (
            <>
              {qr && (
                <div className="flex justify-center">
                  <img
                    src={qr}
                    alt="Invite QR code"
                    className="rounded-2xl border bg-white p-2"
                    width={256}
                    height={256}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">
                  {url}
                </code>
                <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy invite link">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">{expiryLabel(current?.expires_at)}</p>

              <Button className="w-full bg-party-gradient" onClick={share}>
                <Share2 className="mr-2 size-4" aria-hidden /> Share invite
              </Button>

              {/*
                Said here, where it prevents the mistake, rather than in an
                error message after someone has already sent half a link.
              */}
              <p className="text-xs text-muted-foreground">
                The secret is the part after the <code className="font-mono">#</code>. Send the
                whole link, and only to people you want at the party — anyone who has it can get
                in.
              </p>

              {live.length > 1 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Other links you've made</p>
                  {live.slice(1).map((entry) => (
                    <div key={entry.token} className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2 py-1.5 text-xs">
                        {entry.url}
                      </code>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {expiryLabel(entry.expires_at)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Turn off this link"
                        disabled={revoke.isPending}
                        onClick={() =>
                          revoke
                            .mutateAsync({ entry, community })
                            .then(() => toast.success("Link turned off"))
                            .catch((err) =>
                              toast.error(
                                err instanceof Error ? err.message : "Couldn't turn it off",
                              ),
                            )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {/*
                    Never "removed" or "revoked access". Turning a link off stops
                    NEW joins; everyone who already used it holds the channel key
                    and keeps it. Saying otherwise would be a promise the app
                    cannot keep without a CORD-06 rekey.
                  */}
                  <p className="text-xs text-muted-foreground">
                    Turning a link off stops anyone new from joining with it. People who already
                    joined stay in the party.
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full rounded-2xl"
                disabled={minting || mint.isPending}
                onClick={makeAnother}
              >
                <Plus className="mr-1.5 size-4" aria-hidden /> Make another link
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
