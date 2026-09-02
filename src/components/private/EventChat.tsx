/**
 * The private thread.
 *
 * Replaces EventComments entirely for private events — two comment systems on
 * one page is confusing, and the public one would leak. The composer is
 * `sticky` inside this section rather than `fixed`: the bottom of a phone
 * already carries the nav pill and the RSVP dock, and a third fixed bar is
 * unusable at 667px.
 */
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PosterSection } from "@/components/PosterSection";
import { useAuthorsMetadata } from "@/hooks/useAuthorsMetadata";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePrivateEventChat } from "@/hooks/private/usePrivateEventChat";

export function EventChat({ communityId }: { communityId: string }) {
  const { user } = useCurrentUser();
  const { messages, send } = usePrivateEventChat(communityId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const { data: profiles } = useAuthorsMetadata(messages.map((m) => m.pubkey));

  const submit = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await send(text);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Message didn't send");
    } finally {
      setSending(false);
    }
  };

  return (
    <PosterSection title="The thread 💬">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No messages yet. Say hello to the guest list 👋
        </p>
      ) : (
        <ul className="mb-3 max-h-96 space-y-3 overflow-y-auto">
          {messages.map((m) => {
            const p = profiles?.[m.pubkey];
            const name = p?.display_name || p?.name || `${m.pubkey.slice(0, 8)}…`;
            const mine = m.pubkey === user?.pubkey;
            return (
              <li key={m.id} className="flex gap-2">
                <Avatar className="size-7 shrink-0">
                  <AvatarImage src={p?.picture} alt="" loading="lazy" />
                  <AvatarFallback className="text-[10px]">
                    {name[0]?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {mine ? "You" : name} ·{" "}
                    {new Date(m.ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {user && (
        <div className="sticky bottom-0 flex gap-2 bg-transparent pt-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
            placeholder="Message the guest list…"
            className="rounded-full"
          />
          <Button
            onClick={submit}
            disabled={sending || !text.trim()}
            className="rounded-full bg-party-gradient"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      )}
    </PosterSection>
  );
}
