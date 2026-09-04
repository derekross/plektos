/**
 * A private event.
 *
 * Deliberately a separate page from EventDetail rather than a branch inside it.
 * A private event is an unsigned rumor with no naddr, no addressable
 * coordinate, and no public identity — routing it through the public page would
 * put it one prop away from `ShareEventDialog` (publishes a kind 1),
 * `EventComments` (publishes a kind 1111 naming the rumor id) and `useZap`.
 * Separate routes make those unreachable rather than merely unused.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarDays, Loader2, Lock, MapPin, Share2 } from "lucide-react";
import { toast } from "sonner";

import { PosterSection } from "@/components/PosterSection";
import { ChipInSection } from "@/components/private/ChipInSection";
import { EditPrivateEvent } from "@/components/private/EditPrivateEvent";
import { EventChat } from "@/components/private/EventChat";
import { GuestRoster } from "@/components/private/GuestRoster";
import { SignUpBoard } from "@/components/private/SignUpBoard";
import { InviteSheet } from "@/components/private/InviteSheet";
import { PrivacySheet } from "@/components/private/PrivacySheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePrivateEventCalendar } from "@/hooks/private/usePrivateEventCalendar";
import { usePrivateEventLive } from "@/hooks/private/usePrivateEventLive";
import { useDecryptedImage } from "@/hooks/private/useDecryptedImage";
import { formatCalendarEventWhen, type RsvpStatus } from "@/lib/private/calendar";

const RSVP_OPTIONS: { status: RsvpStatus; emoji: string; label: string }[] = [
  { status: "accepted", emoji: "✨", label: "Going" },
  { status: "tentative", emoji: "🤔", label: "Maybe" },
  { status: "declined", emoji: "😢", label: "Can't" },
];

export function PrivateEventDetail() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { event, tally, isLoading, setRsvp, isHost, community, complete } =
    usePrivateEventCalendar(channelId);
  // One subscription for the whole page: the roster, board and thread all read
  // the same stream cache, so they update together.
  usePrivateEventLive(channelId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [busy, setBusy] = useState<RsvpStatus>();

  // Decrypts in the background; the hero renders on the gradient until it lands.
  const { url: coverUrl } = useDecryptedImage(event?.imageEnc);

  // First load with nothing cached shows skeletons, never a fake empty state —
  // "no event" and "haven't reached the relays yet" look identical otherwise.
  if (isLoading && !event) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 p-4">
        <Skeleton className="h-64 w-full rounded-3xl" />
        <Skeleton className="h-32 w-full rounded-3xl" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="container mx-auto max-w-3xl p-8 text-center">
        <Lock className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-2xl font-bold">You're not on this guest list</h1>
        <p className="mt-2 text-muted-foreground">
          Private parties are invite-only. If you have a link, open it and you'll be added.
        </p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container mx-auto max-w-3xl p-8 text-center">
        <h1 className="font-display text-2xl font-bold">{community.name}</h1>
        <p className="mt-2 text-muted-foreground">
          {!complete
            ? "We couldn't read all of this party's history from the relays, and its details are in the part we didn't reach. Try again in a moment."
            : isHost
              ? "Your party is created, but its details haven't landed on the relays yet."
              : "The host hasn't posted the details yet. Check back soon."}
        </p>
      </div>
    );
  }

  const onRsvp = async (status: RsvpStatus) => {
    setBusy(status);
    try {
      await setRsvp(event, status, tally.myGuests);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "RSVP failed");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl space-y-4 p-4 pb-28">
      {/*
        A partial read is not a cosmetic problem: the roster, the sign-up board
        and the thread are all derived from the same stream, so a gap in it
        shows up as guests who are not listed and items that look unclaimed —
        indistinguishable from the truth unless we say so.
      */}
      {!complete && (
        <p className="rounded-2xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Showing part of this party's history — some older messages, RSVPs or
          sign-ups may be missing.
        </p>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-party-gradient p-6 text-primary-foreground">
        {(coverUrl ?? event.image) && (
          <>
            <img
              src={coverUrl ?? event.image}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover"
            />
            <div className="poster-scrim absolute inset-0" />
          </>
        )}
        <div className="relative">
          <button
            onClick={() => setPrivacyOpen(true)}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/30"
          >
            <Lock className="size-3" aria-hidden /> Private · invite only
          </button>
          <h1 className="font-title text-3xl font-bold leading-tight sm:text-5xl">
            {event.title}
          </h1>
          <p className="mt-3 flex items-center gap-2 text-lg opacity-90">
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            {formatCalendarEventWhen(event)}
          </p>
          {event.location && (
            <p className="mt-1 flex items-center gap-2 opacity-90">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {event.location}
            </p>
          )}
          <p className="mt-4 text-sm opacity-80">
            🎉 {tally.headcount.accepted} going
          </p>
        </div>
      </section>

      {isHost && (
        <div className="space-y-2">
          <Button className="w-full bg-party-gradient" onClick={() => setInviteOpen(true)}>
            <Share2 className="mr-2 size-4" aria-hidden /> Invite people
          </Button>
          <EditPrivateEvent
            channelId={channelId!}
            event={event}
            onDeleted={() => navigate("/tickets", { replace: true })}
          />
        </div>
      )}

      {event.description && (
        <PosterSection title="About this party 📝">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {event.description}
          </p>
        </PosterSection>
      )}

      {event.location && (
        <PosterSection title="Where 🗺️">
          <p className="text-sm">{event.location}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            🔒 Only guests can see this address.
          </p>
        </PosterSection>
      )}

      <PosterSection title="Who's coming 🎉">
        <GuestRoster tally={tally} viewerPubkey={user?.pubkey} />
      </PosterSection>

      <ChipInSection event={event} />

      <SignUpBoard channelId={channelId!} />

      {/*
        Replaces EventComments outright for private events. The public comment
        system publishes kind 1111 in the clear, whose `e` tag would name the
        private rumor id.
      */}
      <EventChat channelId={channelId!} />

      {/* RSVP dock */}
      {user && (
        <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-md justify-center gap-2 px-4">
          <div className="glass flex w-full gap-2 rounded-full p-2 shadow-lg">
            {RSVP_OPTIONS.map((opt) => {
              const active = tally.mine === opt.status;
              return (
                <Button
                  key={opt.status}
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className={`flex-1 rounded-full ${active ? "bg-party-gradient" : ""}`}
                  disabled={busy !== undefined}
                  onClick={() => onRsvp(opt.status)}
                  aria-pressed={active}
                >
                  {busy === opt.status ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <>
                      <span aria-hidden>{opt.emoji}</span> {opt.label}
                    </>
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <InviteSheet
        community={community}
        channelIdHex={channelId!}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
      <PrivacySheet
        community={community}
        tally={tally}
        open={privacyOpen}
        onOpenChange={setPrivacyOpen}
      />
    </div>
  );
}
