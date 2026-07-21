import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useSingleEvent } from "@/lib/eventUtils";
import { useEventRSVPs } from "@/hooks/useEventRSVPs";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthor } from "@/hooks/useAuthor";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/lightning";
import { ReminderPanel } from "@/components/ReminderPanel";
import { toast } from "sonner";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { Textarea } from "@/components/ui/textarea";
import { LocationDisplay } from "@/components/LocationDisplay";
import { Badge } from "@/components/ui/badge";
import { Share2, MapPin, MessageSquarePlus, X } from "lucide-react";
import { RSVPAvatars } from "@/components/RSVPAvatars";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type {
  DateBasedEvent,
  TimeBasedEvent,
  LiveEvent,
  RoomMeeting,
  EventRSVP,
} from "@/lib/eventTypes";
import { nip19 } from "nostr-tools";
import { useQueryClient } from "@tanstack/react-query";
import { DeleteEvent } from "@/components/DeleteEvent";
import { EditEvent } from "@/components/EditEvent";
import { ZapButton } from "@/components/ZapButton";
import { ZapReceipts } from "@/components/ZapReceipts";
import { ContactOrganizerDialog } from "@/components/ContactOrganizerDialog";
import { ShareEventDialog } from "@/components/ShareEventDialog";
import { EventComments } from "@/components/EventComments";
import { EventCategories } from "@/components/EventCategories";
import { CalendarOptions } from "@/components/CalendarOptions";
import { decodeEventIdentifier } from "@/lib/nip19Utils";
import { UserActionsMenu } from "@/components/UserActionsMenu";
import { TimezoneDisplay } from "@/components/TimezoneDisplay";
import { cn, sanitizeUrl } from "@/lib/utils";
import { getAvatarShape } from "@/lib/avatarShapes";
import { useEventTheme } from "@/hooks/useEventTheme";
import { EventThemeProvider } from "@/components/EventThemeProvider";
import { getEventTimezone } from "@/lib/eventTimezone";
import { isLiveEvent, getViewingUrl, getLiveEventStatus } from "@/lib/liveEventUtils";
import { getPlatformIcon, isLiveEventType } from "@/lib/platformIcons";
import { ParticipantDisplay } from "@/components/ParticipantDisplay";
import { EffectsLayer } from "@/components/EffectsLayer";
import { parseEffectFromTags } from "@/lib/effects";

type CalendarEvent = DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting;

type RSVPStatus = "accepted" | "tentative" | "declined";

const RSVP_PILLS: Array<{ status: RSVPStatus; label: string; emoji: string }> = [
  { status: "accepted", label: "Going", emoji: "✨" },
  { status: "tentative", label: "Maybe", emoji: "🤔" },
  { status: "declined", label: "Can't", emoji: "😢" },
];

const RSVP_TOASTS: Record<RSVPStatus, string> = {
  accepted: "You're in! 🎉",
  tentative: "Marked as maybe 🤔",
  declined: "Can't make it — noted 😢",
};

/** Resolve the event's start as a Date, across calendar and live kinds. */
function getEventStartDate(event: CalendarEvent): Date | null {
  const isLiveKind = event.kind === 30311 || event.kind === 30313;
  const raw = event.tags.find(
    (t) => t[0] === (isLiveKind ? "starts" : "start"),
  )?.[1];
  if (!raw) return null;

  if (/^\d{10}$/.test(raw)) return new Date(parseInt(raw) * 1000);
  if (/^\d{13}$/.test(raw)) return new Date(parseInt(raw));

  if (event.kind === 31922) {
    // YYYY-MM-DD — construct in local time so the day never shifts
    const [y, m, d] = raw.split("-").map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }

  const n = parseInt(raw);
  if (isNaN(n)) return null;
  return new Date(n < 10000000000 ? n * 1000 : n);
}

/** "SAT · AUG 2 · 8 PM" — the poster's date eyebrow. */
function formatPosterEyebrow(event: CalendarEvent): string | null {
  const date = getEventStartDate(event);
  if (!date) return null;

  const isDateBased = event.kind === 31922;
  // Date-based events are constructed in local time; forcing a timezone
  // on those could shift the calendar day.
  const timeZone = isDateBased ? undefined : getEventTimezone(event) ?? undefined;

  try {
    const day = date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    });
    const time = isDateBased
      ? null
      : date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          timeZone,
        });
    return [day.replace(",", " ·"), time].filter(Boolean).join(" · ");
  } catch {
    // Unknown timezone identifier — fall back to browser time
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
}

/** "Woven by @host" chip on the poster. */
function HostChip({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName =
    metadata?.name || metadata?.display_name || pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const shape = getAvatarShape(metadata);
  const npub = nip19.npubEncode(pubkey);

  return (
    <div className="inline-flex items-center gap-1">
      <Link
        to={`/profile/${npub}`}
        className="glass inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 transition-transform hover:scale-[1.03]"
      >
        <Avatar className="h-7 w-7" shape={shape}>
          <AvatarImage src={profileImage} alt={displayName} />
          <AvatarFallback>{displayName.slice(0, 2)}</AvatarFallback>
        </Avatar>
        <span className="text-sm">
          <span className="text-muted-foreground">Woven by </span>
          <span className="font-semibold">{displayName}</span>
        </span>
      </Link>
      <UserActionsMenu pubkey={pubkey} authorName={displayName} />
    </div>
  );
}

/** Glass section card for below-the-fold content. */
function PosterSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass rounded-3xl p-4 sm:p-6", className)}>
      {title && <h3 className="font-display font-semibold text-lg mb-3">{title}</h3>}
      {children}
    </section>
  );
}

/** One-shot emoji burst for the "Going" moment. Parent unmounts it after ~1s. */
function EmojiBurst() {
  const pieces = useMemo(() => {
    const glyphs = ["🎉", "✨", "🎊", "💜"];
    return Array.from({ length: 14 }, (_, i) => ({
      x: (Math.random() * 2 - 1) * 130,
      y: -(40 + Math.random() * 130),
      r: (Math.random() * 2 - 1) * 100,
      delay: Math.random() * 0.12,
      glyph: glyphs[i % glyphs.length],
    }));
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="fx-burst text-xl"
          style={
            {
              "--burst-x": `${p.x}px`,
              "--burst-y": `${p.y}px`,
              "--burst-r": `${p.r}deg`,
              animationDelay: `${p.delay}s`,
            } as CSSProperties
          }
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}

export function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: singleEvent, isLoading: isLoadingSingleEvent } =
    useSingleEvent(eventId);
  const { user } = useCurrentUser();
  const { mutate: publishRSVP } = useNostrPublish();
  const [submittingStatus, setSubmittingStatus] = useState<RSVPStatus | null>(null);
  const [rsvpNote, setRsvpNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Decode the event identifier
  let eventIdFromIdentifier: string | undefined;
  let decodingError: string | null = null;

  if (eventId) {
    try {
      const decodedEvent = decodeEventIdentifier(eventId);
      if (decodedEvent.type === "naddr") {
        // For replaceable events, the event ID comes from the fetched result
        eventIdFromIdentifier = singleEvent?.id;
      } else if (
        decodedEvent.type === "nevent" ||
        decodedEvent.type === "note" ||
        decodedEvent.type === "raw"
      ) {
        const eventIdDecoded =
          decodedEvent.type === "raw"
            ? decodedEvent.data
            : decodedEvent.type === "note"
            ? decodedEvent.data
            : decodedEvent.data.id;
        eventIdFromIdentifier = eventIdDecoded;
      }
    } catch (error) {
      console.error("Error decoding event identifier:", error);
      decodingError = "Invalid event address";
    }
  } else {
    decodingError = "No event identifier provided";
  }

  const event = singleEvent as CalendarEvent;

  // Extract event theme (Ditto themes via c/f/bg tags)
  const eventTheme = useEventTheme(event);

  // Ambient effect from the fx tag (Living Poster layer)
  const effect = useMemo(
    () => (event?.tags ? parseEffectFromTags(event.tags) : null),
    [event?.tags],
  );

  // Extract event participants from p tags (NIP-52)
  const eventParticipants = event?.tags
    .filter((tag) => tag[0] === "p")
    .map((tag) => ({
      pubkey: tag[1],
      relay: tag[2] || undefined,
      role: tag[3] || "participant",
    })) || [];

  const price = event?.tags.find((tag) => tag[0] === "price")?.[1];
  const lightningAddress = event?.tags.find((tag) => tag[0] === "lud16")?.[1];
  const isPaidEvent = price && lightningAddress;
  const isHost = user?.pubkey === event?.pubkey;
  const imageUrl = event?.tags.find((tag) => tag[0] === "image")?.[1];
  const eventIdentifier = event?.tags.find((tag) => tag[0] === "d")?.[1];
  const title = event?.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
  const location = event?.tags.find((tag) => tag[0] === "location")?.[1];

  // Fetch RSVPs for this specific event (targeted query instead of fetching all events)
  const eventAddress = eventIdentifier ? `${event?.kind}:${event?.pubkey}:${eventIdentifier}` : null;
  const { data: rsvpEvents = [], refetch: refetchRSVPs } = useEventRSVPs(eventIdFromIdentifier, eventAddress);

  // Determine overall loading state
  const isLoading = isLoadingSingleEvent;

  // Get most recent RSVP for each user using a Map for O(n) dedup.
  // Memoized (with stable derived pubkey arrays) so RSVPAvatars children
  // don't re-render or re-query on unrelated state changes.
  const latestRSVPs = useMemo(() => {
    const byPubkey = new Map<string, EventRSVP>();
    for (const rsvp of rsvpEvents) {
      const existing = byPubkey.get(rsvp.pubkey);
      if (!existing || rsvp.created_at > existing.created_at) {
        byPubkey.set(rsvp.pubkey, rsvp);
      }
    }
    return Array.from(byPubkey.values());
  }, [rsvpEvents]);

  // Group RSVPs by status
  const { acceptedRSVPs, tentativeRSVPs, declinedRSVPs } = useMemo(() => {
    const statusOf = (e: EventRSVP) =>
      e.tags.find((tag) => tag[0] === "status")?.[1];
    return {
      acceptedRSVPs: latestRSVPs.filter((e) => statusOf(e) === "accepted"),
      tentativeRSVPs: latestRSVPs.filter((e) => statusOf(e) === "tentative"),
      declinedRSVPs: latestRSVPs.filter((e) => statusOf(e) === "declined"),
    };
  }, [latestRSVPs]);

  const acceptedPubkeys = useMemo(() => acceptedRSVPs.map((e) => e.pubkey), [acceptedRSVPs]);
  const tentativePubkeys = useMemo(() => tentativeRSVPs.map((e) => e.pubkey), [tentativeRSVPs]);
  const declinedPubkeys = useMemo(() => declinedRSVPs.map((e) => e.pubkey), [declinedRSVPs]);

  const participants = useMemo(() => latestRSVPs.map((e) => e.pubkey), [latestRSVPs]);

  const userRSVP = latestRSVPs.find((e) => e.pubkey === user?.pubkey);
  const currentStatus = userRSVP?.tags.find(
    (tag) => tag[0] === "status"
  )?.[1] as RSVPStatus | undefined;
  const currentNote = userRSVP?.content;

  // Clear the one-shot burst overlay after its animation finishes
  useEffect(() => {
    if (!burstKey) return;
    const timer = setTimeout(() => setBurstKey(0), 1000);
    return () => clearTimeout(timer);
  }, [burstKey]);

  // Enhanced event update handler with proper refresh
  const handleEventUpdated = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate all related queries
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["eventRSVPs"] });
      await queryClient.invalidateQueries({ queryKey: ["comments"] });
      await queryClient.invalidateQueries({ queryKey: ["reactions"] });

      // Force a refetch of RSVPs
      await refetchRSVPs();

      toast.success("Event details refreshed!");
    } catch (error) {
      console.error("Error refreshing event data:", error);
      toast.error("Could not refresh event details");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Early return for loading states
  if (isLoading || isRefreshing) {
    return (
      <div className="container max-w-3xl px-4 py-16">
        <div className="glass rounded-3xl p-6 text-center">
          <div className="inline-flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
            <span>
              {isRefreshing
                ? "Refreshing event details..."
                : "Loading event..."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Early return for decoding errors
  if (decodingError) {
    return (
      <div className="container max-w-3xl px-4 py-16">
        <div className="glass rounded-3xl p-6 text-center">
          <p className="text-destructive">{decodingError}</p>
        </div>
      </div>
    );
  }

  // Early return for event not found
  if (!event) {
    return (
      <div className="container max-w-3xl px-4 py-16">
        <div className="glass rounded-3xl p-8 text-center">
          <h2 className="font-display text-xl font-semibold mb-2">Event not found</h2>
          <p className="text-muted-foreground mb-6">
            The event you're looking for doesn't exist or may have been
            deleted.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2"
          >
            <span>← Back to Events</span>
          </Button>
        </div>
      </div>
    );
  }

  const handleRSVP = (status: RSVPStatus) => {
    if (!user || !eventIdentifier || submittingStatus) return;

    setSubmittingStatus(status);
    const tags = [
      ["e", event.id],
      ["a", `${event.kind}:${event.pubkey}:${eventIdentifier}`],
      ["d", crypto.randomUUID()],
      ["status", status],
      ["p", event.pubkey],
    ];

    publishRSVP(
      {
        kind: 31925,
        content: rsvpNote,
        tags,
      },
      {
        onSuccess: () => {
          toast.success(RSVP_TOASTS[status]);
          setRsvpNote("");
          setNoteOpen(false);
          if (status === "accepted") setBurstKey(Date.now());
          // Invalidate and refetch RSVPs for this event
          queryClient.invalidateQueries({ queryKey: ["eventRSVPs"] });
        },
        onError: (error) => {
          toast.error("Failed to submit RSVP");
          console.error("Error submitting RSVP:", error);
        },
        onSettled: () => setSubmittingStatus(null),
      }
    );
  };

  const eyebrow = formatPosterEyebrow(event);
  const platformIcon = isLiveEventType(event) ? getPlatformIcon(event) : null;
  const goingCount = acceptedRSVPs.length;
  const safeImageUrl = sanitizeUrl(imageUrl);

  const content = (
    <div className="relative">
      {/* ---- The Living Poster ---- */}
      <section className="relative flex min-h-[68svh] flex-col justify-end overflow-hidden">
        <div className="absolute inset-0" aria-hidden>
          {safeImageUrl ? (
            <img
              src={safeImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full">
              <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
              <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-glow2/25 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
            </div>
          )}
          <div className="absolute inset-0 poster-scrim" />
        </div>

        {effect && <EffectsLayer effect={effect} />}

        <div className="container relative max-w-3xl px-4 pb-8 pt-32 sm:pb-12 animate-slide-up">
          {eyebrow && (
            <p className="mb-3 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.18em]">
              {platformIcon && (
                <span title={`Live on ${platformIcon.name}`}>{platformIcon.icon}</span>
              )}
              {eyebrow}
            </p>
          )}
          <h1 className="font-title text-balance break-words text-[clamp(2.25rem,8vw,4.5rem)] font-extrabold leading-[1.05] drop-shadow-[0_2px_20px_hsl(var(--background)/0.8)]">
            {title}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <HostChip pubkey={event.pubkey} />
            {location && (
              <span className="glass inline-flex max-w-full items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{location}</span>
              </span>
            )}
            {goingCount > 0 && (
              <span className="glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm">
                🎉 {goingCount} going
              </span>
            )}
            {isPaidEvent && (
              <span className="glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm">
                🎟️ {formatAmount(parseInt(price, 10) || 0)}
              </span>
            )}
          </div>

          {user && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ContactOrganizerDialog
                organizerPubkey={event.pubkey}
                eventTitle={title}
              />
              <CalendarOptions event={event} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareDialogOpen(true)}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ---- Below the fold ---- */}
      <div className="container max-w-3xl space-y-5 px-4 pb-44 pt-2 md:pb-36">
        <PosterSection title="About this party 📝">
          <p className="whitespace-pre-wrap break-words text-muted-foreground">
            {event.content}
          </p>
          <div className="mt-3">
            <EventCategories
              categories={event.tags
                .filter((tag) => tag[0] === "t")
                .map((tag) => tag[1])}
            />
          </div>
        </PosterSection>

        {/* Live Event Section */}
        {isLiveEvent(event) && (
          <PosterSection title="Live event 🎥">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={cn(
                  "px-3 py-1 rounded-full text-sm font-semibold",
                  event.kind === 30311 && getLiveEventStatus(event as LiveEvent) === 'live'
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-blue-500 text-white"
                )}>
                  {event.kind === 30311 && getLiveEventStatus(event as LiveEvent) === 'live' ? (
                    <>
                      <span className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></span>
                      LIVE NOW
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 bg-white rounded-full mr-1"></span>
                      LIVE EVENT
                    </>
                  )}
                </Badge>
                {event.kind === 30311 && (
                  <Badge variant="outline" className="text-xs">
                    Status: {getLiveEventStatus(event as LiveEvent)}
                  </Badge>
                )}
              </div>

              {sanitizeUrl(getViewingUrl(event)) && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <h4 className="mb-2 font-medium">🎥 Watch Live</h4>
                  <div className="flex items-center gap-2">
                    <a
                      href={sanitizeUrl(getViewingUrl(event))!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sm font-medium text-primary hover:underline"
                    >
                      {getViewingUrl(event)}
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(getViewingUrl(event)!);
                        toast.success("Stream URL copied to clipboard!");
                      }}
                      className="flex-shrink-0"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}

              {event.kind === 30311 && (
                <div className="text-sm text-muted-foreground">
                  <p>This is a NIP-53 live event. Join the stream using the URL above or check the event description for more details.</p>
                </div>
              )}
            </div>
          </PosterSection>
        )}

        <PosterSection title="When & where 🗺️">
          <div className="space-y-3">
            <TimezoneDisplay event={event} showLocalTime={true} />
            <LocationDisplay location={location || ""} />
            {eventParticipants.length > 0 && (
              <ParticipantDisplay participants={eventParticipants} />
            )}
          </div>
        </PosterSection>

        <PosterSection title="The guest thread 🧵">
          <div className="woven-line mb-4 rounded-full" />
          {latestRSVPs.length === 0 ? (
            <p className="text-muted-foreground">
              No one's woven in yet. Be the first ✨
            </p>
          ) : (
            <div className="space-y-4">
              {acceptedRSVPs.length > 0 && (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-green-500/10 text-green-500 text-xs"
                    >
                      Going ✨
                    </Badge>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {acceptedRSVPs.length}{" "}
                      {acceptedRSVPs.length === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <RSVPAvatars pubkeys={acceptedPubkeys} maxVisible={8} />
                </div>
              )}
              {tentativeRSVPs.length > 0 && (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-yellow-500/10 text-yellow-500 text-xs"
                    >
                      Maybe 🤔
                    </Badge>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {tentativeRSVPs.length}{" "}
                      {tentativeRSVPs.length === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <RSVPAvatars pubkeys={tentativePubkeys} />
                </div>
              )}
              {declinedRSVPs.length > 0 && (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-red-500/10 text-red-500 text-xs"
                    >
                      Can't 😢
                    </Badge>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {declinedRSVPs.length}{" "}
                      {declinedRSVPs.length === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <RSVPAvatars pubkeys={declinedPubkeys} />
                </div>
              )}
            </div>
          )}
        </PosterSection>

        {isPaidEvent && (
          <PosterSection title="Tickets 🎟️">
            <p className="mb-4 text-muted-foreground">
              Price: {formatAmount(parseInt(price, 10) || 0)}
            </p>
            {user ? (
              <ZapButton
                pubkey={event.pubkey}
                displayName={title}
                lightningAddress={lightningAddress || ""}
                eventId={event.id}
                eventKind={event.kind}
                eventIdentifier={eventIdentifier}
                fixedAmount={parseInt(price, 10) || 0}
                buttonText="🎟️ Purchase Ticket"
                className="w-full bg-party-gradient text-primary-foreground font-bold shadow-glow hover:scale-105 transition-transform duration-200 relative overflow-hidden"
              />
            ) : (
              <p className="text-muted-foreground">
                Please log in to purchase a ticket
              </p>
            )}
          </PosterSection>
        )}

        {isHost && (
          <ReminderPanel
            event={event}
            isHost={isHost}
            participants={participants}
          />
        )}

        {isHost && (
          <ZapReceipts eventId={event.id} eventPubkey={event.pubkey} />
        )}

        <PosterSection>
          <EventComments
            eventId={event.id}
            eventTitle={title}
            eventKind={event.kind}
            eventPubkey={event.pubkey}
            eventIdentifier={eventIdentifier}
          />
        </PosterSection>

        {isHost && (
          <div className="flex gap-2">
            <EditEvent event={event} onEventUpdated={handleEventUpdated} />
            <DeleteEvent
              eventId={event.id}
              eventKind={event.kind}
              onDeleted={() => navigate("/")}
            />
          </div>
        )}
      </div>

      {/* ---- Pinned RSVP dock ---- */}
      {user && !isHost && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 px-4 md:bottom-6">
          {noteOpen && (
            <div className="pointer-events-auto mx-auto mb-2 w-full max-w-md glass rounded-3xl p-3 animate-slide-up">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Add a note to your RSVP
                </label>
                <button
                  type="button"
                  onClick={() => setNoteOpen(false)}
                  aria-label="Close note"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Textarea
                placeholder="Bringing snacks! 🍕"
                value={rsvpNote}
                onChange={(e) => setRsvpNote(e.target.value)}
                className="min-h-[60px] border-none bg-transparent px-1 focus-visible:ring-0"
              />
              {currentNote && (
                <p className="mt-1 px-1 text-xs text-muted-foreground">
                  Current note: {currentNote}
                </p>
              )}
              <p className="mt-1 px-1 text-xs text-muted-foreground">
                Pick a pill below to send it ✨
              </p>
            </div>
          )}
          <div className="pointer-events-auto relative mx-auto flex w-fit max-w-full items-center gap-1 rounded-full glass p-1.5 shadow-glow">
            {burstKey > 0 && <EmojiBurst key={burstKey} />}
            {RSVP_PILLS.map(({ status, label, emoji }) => {
              const isActive = currentStatus === status;
              const isSubmitting = submittingStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  disabled={submittingStatus !== null}
                  onClick={() => handleRSVP(status)}
                  aria-pressed={isActive}
                  className={cn(
                    "touch-target inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-60 sm:px-5",
                    isActive
                      ? "bg-party-gradient text-primary-foreground shadow-glow"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {isSubmitting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <span>{emoji}</span>
                  )}
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setNoteOpen((open) => !open)}
              aria-label="Add a note to your RSVP"
              aria-expanded={noteOpen}
              className={cn(
                "touch-target inline-flex items-center justify-center rounded-full p-2.5 transition-colors",
                noteOpen || rsvpNote
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Share Event Dialog */}
      {user && (
        <ShareEventDialog
          event={event}
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
        />
      )}
    </div>
  );

  // Wrap in EventThemeProvider if the event has a custom theme
  if (eventTheme) {
    return <EventThemeProvider theme={eventTheme}>{content}</EventThemeProvider>;
  }

  return content;
}
