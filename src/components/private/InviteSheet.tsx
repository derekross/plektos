/**
 * Sharing a private event.
 *
 * QR first, deliberately: the common case for a house party is showing someone
 * your phone. Copy and share follow for the remote case.
 */
import { useEffect, useState } from "react";
import QRCodeLib from "qrcode";
import { Check, Copy, Loader2, QrCode, Share2 } from "lucide-react";
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
import { useMintInvite } from "@/hooks/private/useInvite";

export function InviteSheet({
  community,
  channelIdHex,
  open,
  onOpenChange,
}: {
  community: Community;
  /** The one party being shared — an invite must never carry the others. */
  channelIdHex: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mint = useMintInvite();
  const [url, setUrl] = useState<string>();
  const [qr, setQr] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || url || mint.isPending) return;
    mint
      .mutateAsync({ community, channelIdHex })
      .then(setUrl)
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't create an invite link"),
      );
  }, [open, url, mint, community, channelIdHex]);

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
          {!url ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Creating your invite…
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
                <Button size="sm" variant="secondary" onClick={copy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>

              <Button className="w-full bg-party-gradient" onClick={share}>
                <Share2 className="mr-2 size-4" aria-hidden /> Share invite
              </Button>

              {/*
                Said here, where it prevents the mistake, rather than in an
                error message after someone has already sent half a link.
              */}
              <p className="text-xs text-muted-foreground">
                The secret is the part after the <code className="font-mono">#</code>. Send the
                whole link, and only to people you want at the party — anyone who has it can
                get in.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
