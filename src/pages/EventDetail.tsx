import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useSingleEvent } from "@/lib/eventUtils";
import { useEventRSVPs } from "@/hooks/useEventRSVPs";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthor } from "@/hooks/useAuthor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/lightning";
import { ReminderPanel } from "@/components/ReminderPanel";
import { toast } from "sonner";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { Textarea } from "@/components/ui/textarea";
import { LocationDisplay } from "@/components/LocationDisplay";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Share2, Calendar, Users } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { isLiveEvent, getViewingUrl, getLiveEventStatus } from "@/lib/liveEventUtils";
import { getPlatformIcon, isLiveEventType } from "@/lib/platformIcons";
import { ParticipantDisplay } from "@/components/ParticipantDisplay";

function getStatusColor(status: string) {
  switch (status) {
    case "accepted":
      return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
    case "tentative":
      return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20";
    case "declined":
      return "bg-red-500/10 text-red-500 hover:bg-red-500/20";
    default:
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "accepted":
      return "Going";
    case "tentative":
      return "Maybe";
    case "declined":
      return "Can't Go";
    default:
      return status;
  }
}

function LinkifiedText({ text }: { text: string }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function EventAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName =
    metadata?.name || metadata?.display_name || pubkey.slice(0, 8);
  const profileImage = metadata?.picture;

  // Create npub address for the profile link
  const npub = nip19.npubEncode(pubkey);

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        to={`/profile/${npub}`}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <Avatar className="h-6 w-6">
          <AvatarImage src={profileImage} alt={displayName} />
          <AvatarFallback>{displayName.slice(0, 2)}</AvatarFallback>
        </Avatar>
        <span className="text-sm text-muted-foreground">
          Created by {displayName}
        </span>
      </Link>
      <UserActionsMenu pubkey={pubkey} authorName={displayName} />
    </div>
  );
}

export function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: singleEvent, isLoading: isLoadingSingleEvent } =
    useSingleEvent(eventId);
  const { user } = useCurrentUser();
  const { mutate: publishRSVP } = useNostrPublish();
  const [rsvpStatus, setRsvpStatus] = useState<
    "accepted" | "declined" | "tentative"
  >("accepted");
  const [rsvpNote, setRsvpNote] = useState("");
  const [isSubmittingRSVP, setIsSubmittingRSVP] = useState(false);
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

  const event = singleEvent as DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting;

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

  // Fetch RSVPs for this specific event (targeted query instead of fetching all events)
  const eventAddress = eventIdentifier ? `${event?.kind}:${event?.pubkey}:${eventIdentifier}` : null;
  const { data: rsvpEvents = [], refetch: refetchRSVPs } = useEventRSVPs(eventIdFromIdentifier, eventAddress);

  // Determine overall loading state
  const isLoading = isLoadingSingleEvent;

  // Get most recent RSVP for each user
  const latestRSVPs = rsvpEvents.reduce((acc, curr) => {
    const existingRSVP = acc.find((e) => e.pubkey === curr.pubkey);
    if (!existingRSVP || curr.created_at > existingRSVP.created_at) {
      // Remove any existing RSVP for this user
      const filtered = acc.filter((e) => e.pubkey !== curr.pubkey);
      return [...filtered, curr];
    }
    return acc;
  }, [] as EventRSVP[]);

  // Group RSVPs by status
  const acceptedRSVPs = latestRSVPs.filter(
    (e) => e.tags.find((tag) => tag[0] === "status")?.[1] === "accepted"
  );

  const tentativeRSVPs = latestRSVPs.filter(
    (e) => e.tags.find((tag) => tag[0] === "status")?.[1] === "tentative"
  );

  const declinedRSVPs = latestRSVPs.filter(
    (e) => e.tags.find((tag) => tag[0] === "status")?.[1] === "declined"
  );

  const participants = latestRSVPs.map((e) => e.pubkey);

  const userRSVP = latestRSVPs.find((e) => e.pubkey === user?.pubkey);
  const currentStatus = userRSVP?.tags.find(
    (tag) => tag[0] === "status"
  )?.[1] as "accepted" | "declined" | "tentative" | undefined;
  const currentNote = userRSVP?.content;

  // When the current status changes (component re-renders), sync it with rsvpStatus
  useEffect(() => {
    if (currentStatus) {
      setRsvpStatus(currentStatus);
    }
  }, [currentStatus]);

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
      <div className="container px-0 sm:px-4 py-2 sm:py-6">
        <Card className="rounded-none sm:rounded-lg">
          <CardContent className="p-6">
            <div className="text-center py-12">
              <div className="inline-flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                <span>
                  {isRefreshing
                    ? "Refreshing event details..."
                    : "Loading event..."}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Early return for decoding errors
  if (decodingError) {
    return (
      <div className="container px-0 sm:px-4 py-2 sm:py-6">
        <Card className="rounded-none sm:rounded-lg">
          <CardContent className="p-6">
            <div className="text-center py-12">
              <p className="text-destructive">{decodingError}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Early return for event not found
  if (!event) {
    return (
      <div className="container px-0 sm:px-4 py-2 sm:py-6">
        <Card className="rounded-none sm:rounded-lg">
          <CardContent className="p-6">
            <div className="text-center py-12">
              <h2 className="text-xl font-semibold mb-2">Event not found</h2>
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
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleRSVP = async () => {
    if (!user || !eventIdentifier) return;

    setIsSubmittingRSVP(true);
    try {
      const tags = [
        ["e", event.id],
        ["a", `${event.kind}:${event.pubkey}:${eventIdentifier}`],
        ["d", Math.random().toString(36).substring(2)],
        ["status", rsvpStatus],
        ["p", event.pubkey],
      ];

      await publishRSVP(
        {
          kind: 31925,
          content: rsvpNote,
          tags,
        },
        {
          onSuccess: () => {
            toast.success("RSVP submitted successfully!");
            setRsvpNote("");
            // Invalidate and refetch RSVPs for this event
            queryClient.invalidateQueries({ queryKey: ["eventRSVPs"] });
          },
        }
      );
    } catch (error) {
      toast.error("Failed to submit RSVP");
      console.error("Error submitting RSVP:", error);
    } finally {
      setIsSubmittingRSVP(false);
    }
  };

  return (
    <div className="container max-w-4xl px-0 sm:px-4 py-2 sm:py-8">
      <Card className="rounded-none sm:rounded-lg">
        <div className="aspect-video w-full overflow-hidden">
          <img
            src={imageUrl || "/default-calendar.png"}
            alt={
              event.tags.find((tag) => tag[0] === "title")?.[1] ||
              "Event image"
            }
            className="w-full h-full object-cover"
          />
        </div>
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <div className="space-y-1 sm:space-y-2">
              <CardTitle className="flex items-center gap-2">
                {isLiveEventType(event) && getPlatformIcon(event) && (
                  <span
                    className="text-2xl flex-shrink-0"
                    title={`Live on ${getPlatformIcon(event)?.name}`}
                  >
                    {getPlatformIcon(event)?.icon}
                  </span>
                )}
                <span className="flex-1">
                  {event.tags.find((tag) => tag[0] === "title")?.[1]}
                </span>
              </CardTitle>
              <EventAuthor pubkey={event.pubkey} />
            </div>
            {user && (
              <div className="flex items-center gap-1 sm:gap-2 self-start sm:self-auto">
                <ContactOrganizerDialog
                  organizerPubkey={event.pubkey}
                  eventTitle={
                    event.tags.find((tag) => tag[0] === "title")?.[1] || "Event"
                  }
                />
                <CalendarOptions
                  event={event as DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting}
                />
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
        </CardHeader>
        <CardContent className="p-3 sm:p-6 space-y-3 sm:space-y-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">📝 Description</h3>
            <div className="text-muted-foreground whitespace-pre-wrap break-words">
              <LinkifiedText text={event.content || ""} />
            </div>
          </div>

          <EventCategories
            categories={event.tags
              .filter((tag) => tag[0] === "t")
              .map((tag) => tag[1])}
          />

          <div>
            <h3 className="font-semibold flex items-center gap-2">📍 Location</h3>
            <LocationDisplay
              location={event.tags.find((tag) => tag[0] === "location")?.[1] || ""}
            />
          </div>

          {eventParticipants.length > 0 && (
            <ParticipantDisplay participants={eventParticipants} />
          )}

          {/* Live Event Section */}
          {isLiveEvent(event) && (
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                🎥 Live Event Details
              </h3>
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

                {getViewingUrl(event) && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      🎥 Watch Live
                    </h4>
                    <div className="flex items-center gap-2">
                      <a
                        href={getViewingUrl(event)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm break-all"
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
            </div>
          )}

          <div>
            <h3 className="font-semibold flex items-center gap-2">🕒 Date & Time</h3>
            <TimezoneDisplay event={event} showLocalTime={true} />
          </div>

          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
              <span className="text-base sm:text-lg">🧑‍🤝‍🧑</span>
              <span>Attendees</span>
            </h3>
            <div className="space-y-3 sm:space-y-4">
              {acceptedRSVPs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="bg-green-500/10 text-green-500 text-xs"
                    >
                      Going
                    </Badge>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {acceptedRSVPs.length}{" "}
                      {acceptedRSVPs.length === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <RSVPAvatars pubkeys={acceptedRSVPs.map((e) => e.pubkey)} />
                </div>
              )}
              {tentativeRSVPs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="bg-yellow-500/10 text-yellow-500 text-xs"
                    >
                      Maybe
                    </Badge>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {tentativeRSVPs.length}{" "}
                      {tentativeRSVPs.length === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <RSVPAvatars pubkeys={tentativeRSVPs.map((e) => e.pubkey)} />
                </div>
              )}
              {declinedRSVPs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="bg-red-500/10 text-red-500 text-xs"
                    >
                      Can't Go
                    </Badge>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {declinedRSVPs.length}{" "}
                      {declinedRSVPs.length === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <RSVPAvatars pubkeys={declinedRSVPs.map((e) => e.pubkey)} />
                </div>
              )}
            </div>
          </div>

          {user && !isHost && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> RSVP</h3>
                {currentStatus && (
                  <Badge
                    variant="outline"
                    className={getStatusColor(currentStatus)}
                  >
                    {getStatusLabel(currentStatus)}
                  </Badge>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {currentStatus ? "Change Status" : "Select Status"}
                  </label>
                  <Select
                    value={rsvpStatus}
                    onValueChange={(
                      value: "accepted" | "declined" | "tentative"
                    ) => setRsvpStatus(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select your status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accepted">I'm going</SelectItem>
                      <SelectItem value="tentative">Maybe</SelectItem>
                      <SelectItem value="declined">Can't go</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {currentNote ? "Update Note" : "Add Note (Optional)"}
                  </label>
                  <Textarea
                    placeholder="Add a note to your RSVP..."
                    value={rsvpNote}
                    onChange={(e) => setRsvpNote(e.target.value)}
                    className="min-h-[100px]"
                  />
                  {currentNote && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Current note: {currentNote}
                    </p>
                  )}
                </div>
                <Button
                  onClick={handleRSVP}
                  disabled={isSubmittingRSVP}
                  className="px-12 py-4 text-lg font-semibold rounded-2xl bg-party-gradient hover:opacity-90 transition-all duration-200 hover:scale-105 shadow-lg flex items-center justify-center gap-2 mx-auto"
                >
                  {isSubmittingRSVP ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </div>
                  ) : (
                    <>
                      <Calendar className="h-5 w-5 text-primary" />
                      <span>{currentStatus ? "Update RSVP" : "Submit RSVP"}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {isPaidEvent && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">🎟️ Ticket Information</h3>
              <p className="text-muted-foreground mb-4">
                Price: {formatAmount(parseInt(price))}
              </p>
              {user ? (
                <ZapButton
                  pubkey={event.pubkey}
                  displayName={
                    event.tags.find((tag) => tag[0] === "title")?.[1] || "Event"
                  }
                  lightningAddress={lightningAddress || ""}
                  eventId={event.id}
                  eventKind={event.kind}
                  eventIdentifier={eventIdentifier}
                  fixedAmount={parseInt(price)}
                  buttonText="🎟️ Purchase Ticket"
                  className="w-full bg-gradient-to-r from-primary to-primary/70 text-primary-foreground font-bold shadow-lg hover:scale-105 transition-transform duration-200 relative overflow-hidden"
                />
              ) : (
                <p className="text-muted-foreground">
                  Please log in to purchase a ticket
                </p>
              )}
            </div>
          )}

          {isHost && (
            <ReminderPanel
              event={event as DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting}
              isHost={isHost}
              participants={participants}
            />
          )}

          {event && (
            <div className="space-y-8">
              {isHost && (
                <ZapReceipts eventId={event.id} eventPubkey={event.pubkey} />
              )}
              <EventComments
                eventId={event.id}
                eventTitle={
                  event.tags.find((tag) => tag[0] === "title")?.[1] || "Event"
                }
                eventKind={event.kind}
                eventPubkey={event.pubkey}
                eventIdentifier={eventIdentifier}
              />
            </div>
          )}
        </CardContent>
      </Card>
      {user && user.pubkey === event.pubkey && (
        <div className="mt-4 flex gap-2">
          <EditEvent event={event as DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting} onEventUpdated={handleEventUpdated} />
          <DeleteEvent
            eventId={event.id}
            eventKind={event.kind}
            onDeleted={() => navigate("/")}
          />
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
}
