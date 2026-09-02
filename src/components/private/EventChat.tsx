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
import { Loader2, Quote, Send, SmilePlus, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PosterSection } from "@/components/PosterSection";
import { useAuthorsMetadata } from "@/hooks/useAuthorsMetadata";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePrivateEventChat, type PrivateMessage } from "@/hooks/private/usePrivateEventChat";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const QUICK_REACTIONS = ["🎉", "❤️", "🔥", "😂", "👀", "👍"];

export function EventChat({ channelId }: { channelId: string }) {
  const { user } = useCurrentUser();
  const { messages, send, toggleReaction } = usePrivateEventChat(channelId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [quoting, setQuoting] = useState<PrivateMessage>();

  const { data: profiles } = useAuthorsMetadata(messages.map((m) => m.pubkey));

  const submit = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await send(text, quoting);
      setText("");
      setQuoting(undefined);
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
              <li key={m.id} className="group flex gap-2">
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

                  {m.quote && (
                    <div className="mb-1 border-l-2 border-primary/40 bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                      <span className="line-clamp-2 break-words">{m.quote.content}</span>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>

                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        onClick={() => toggleReaction(m, r.emoji)}
                        aria-pressed={Boolean(r.mine)}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs transition-colors",
                          r.mine ? "border-primary bg-primary/10" : "hover:bg-muted",
                        )}
                      >
                        {r.emoji} {r.count}
                      </button>
                    ))}

                    {user && (
                      <>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              aria-label="Add a reaction"
                              className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100"
                            >
                              <SmilePlus className="size-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1.5" align="start">
                            <div className="flex gap-1">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(m, emoji)}
                                  className="rounded-md px-1.5 py-1 text-lg hover:bg-muted"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        <button
                          aria-label="Quote this message"
                          onClick={() => setQuoting(m)}
                          className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100"
                        >
                          <Quote className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {user && (
        <div className="sticky bottom-0 space-y-2 bg-transparent pt-2">
          {quoting && (
            <div className="flex items-start gap-2 rounded-xl border-l-2 border-primary bg-muted/60 px-2 py-1.5 text-xs">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 line-clamp-2 break-words text-muted-foreground">
                {quoting.content}
              </span>
              <button
                aria-label="Cancel quote"
                onClick={() => setQuoting(undefined)}
                className="shrink-0 rounded p-0.5 hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
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
        </div>
      )}
    </PosterSection>
  );
}
