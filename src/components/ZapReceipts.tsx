import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import { useAuthor } from "@/hooks/useAuthor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarShape } from "@/lib/avatarShapes";
import { formatAmount } from "@/lib/lightning";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "@nostrify/nostrify";

interface ZapReceiptsProps {
  eventId: string;
  eventPubkey: string;
}

export function ZapReceipts({ eventId, eventPubkey }: ZapReceiptsProps) {
  const { nostr } = useNostr();

  const { data: zapReceipts } = useQuery({
    queryKey: ["zapReceipts", eventId],
    queryFn: async () => {
      const signal = AbortSignal.timeout(5000);
      // Decode nevent if provided to get the raw event ID
      let eventIdToQuery = eventId;
      try {
        if (eventId.startsWith("nevent")) {
          const decoded = nip19.decode(eventId);
          if (decoded.type === "nevent") {
            eventIdToQuery = decoded.data.id;
          }
        }
      } catch (error) {
        console.error("Error decoding nevent:", error);
      }

      const events = await nostr.query(
        [
          {
            kinds: [9735], // Zap receipt
            "#e": [eventIdToQuery],
            "#p": [eventPubkey],
          },
        ],
        { signal }
      );
      return events;
    },
  });

  if (!zapReceipts?.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Ticket Purchases</h3>
      <div className="space-y-3">
        {zapReceipts.map((receipt) => {
          // Get the zap request from the description tag
          const zapRequestStr = receipt.tags.find(
            (tag) => tag[0] === "description"
          )?.[1];
          if (!zapRequestStr) return null;

          // Parse the zap request
          let zapRequest: NostrEvent;
          try {
            zapRequest = JSON.parse(zapRequestStr);
          } catch {
            return null;
          }

          // Get the amount from the zap request
          const amount = zapRequest.tags.find(
            (tag) => tag[0] === "amount"
          )?.[1];
          if (!amount) return null;

          return (
            <ZapReceipt
              key={receipt.id}
              receipt={receipt}
              zapRequest={zapRequest}
              amount={parseInt(amount) / 1000} // Convert from millisats to sats
            />
          );
        })}
      </div>
    </div>
  );
}

function ZapReceipt({
  receipt,
  zapRequest,
  amount,
}: {
  receipt: NostrEvent;
  zapRequest: NostrEvent;
  amount: number;
}) {
  const author = useAuthor(zapRequest.pubkey);
  const metadata = author.data?.metadata;
  const displayName =
    metadata?.name || metadata?.display_name || zapRequest.pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const shape = getAvatarShape(metadata);
  const npub = nip19.npubEncode(zapRequest.pubkey);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border">
      <Avatar className="h-10 w-10" shape={shape}>
        <AvatarImage src={profileImage} alt={displayName} />
        <AvatarFallback>{displayName.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <a
            href={`/profile/${npub}`}
            className="font-medium hover:underline truncate"
          >
            {displayName}
          </a>
          <span className="text-sm font-medium tabular-nums">
            {formatAmount(amount)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {new Date(receipt.created_at * 1000).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
