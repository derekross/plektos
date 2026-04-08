import { useParams } from "react-router-dom";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createEventIdentifier } from "@/lib/nip19Utils";
import { nip19 } from "nostr-tools";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { UserActionsMenu } from "@/components/UserActionsMenu";
import { ZappableLightningAddress } from "@/components/ZappableLightningAddress";
import { EditProfileForm } from "@/components/EditProfileForm";
import { ExternalLink, Loader2, Settings, PartyPopper, Users, CalendarDays, Plus } from "lucide-react";
import { useUserCalendars } from "@/lib/calendarUtils";
import { TimezoneDisplay } from "@/components/TimezoneDisplay";
import type {
  DateBasedEvent,
  TimeBasedEvent,
  EventRSVP,
} from "@/lib/eventTypes";
import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function Profile() {
  const { npub } = useParams<{ npub: string }>();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const [pubkey, setPubkey] = useState<string | undefined>(undefined);

  // Decode npub to get pubkey
  useEffect(() => {
    try {
      if (npub) {
        if (npub.startsWith("npub1")) {
          const decoded = nip19.decode(npub);
          if (decoded.type === "npub") {
            setPubkey(decoded.data);
          }
        } else if (npub.length === 64) {
          // Fallback if a raw hex string was passed instead of an encoded npub
          setPubkey(npub);
        }
      }
    } catch (error) {
      console.error("Error decoding npub:", error);
    }
  }, [npub]);

  // Primary author data - show this ASAP
  const author = useAuthor(pubkey);

  // Secondary data with timeouts - don't block the UI
  const {
    data: createdEvents = [],
    isLoading: isLoadingCreated,
    error: createdEventsError,
  } = useQuery({
    queryKey: ["createdEvents", pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];
      const events = await nostr.query(
        [{ kinds: [31922, 31923], authors: [pubkey] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );
      return events as unknown as (DateBasedEvent | TimeBasedEvent)[];
    },
    enabled: !!pubkey,
    retry: 1,
    staleTime: 30000, // Cache for 30 seconds
  });

  const {
    data: rsvps = [],
    isLoading: isLoadingRSVPs,
    error: rsvpsError,
  } = useQuery({
    queryKey: ["rsvps", pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];
      const events = await nostr.query(
        [{ kinds: [31925], authors: [pubkey] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );
      return events as unknown as EventRSVP[];
    },
    enabled: !!pubkey,
    retry: 1,
    staleTime: 30000,
  });

  const {
    data: receivedRsvps = [],
    isLoading: isLoadingReceivedRsvps,
  } = useQuery({
    queryKey: ["receivedRsvps", pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];
      const events = await nostr.query(
        [{ kinds: [31925], "#p": [pubkey] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );
      return events as unknown as EventRSVP[];
    },
    enabled: !!pubkey,
    retry: 1,
    staleTime: 30000,
  });

  // Fetch the actual events that were RSVP'd to
  const {
    data: rsvpEvents = [],
    isLoading: isLoadingRsvpEvents,
    error: rsvpEventsError,
  } = useQuery({
    queryKey: ["rsvpEvents", rsvps],
    queryFn: async ({ signal }) => {
      if (!rsvps.length) return [];
      const eventIds = rsvps
        .map((rsvp) => rsvp.tags.find((tag) => tag[0] === "e")?.[1])
        .filter((id): id is string => id !== undefined);
      if (!eventIds.length) return [];
      const events = await nostr.query(
        [{ kinds: [31922, 31923], ids: eventIds }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );
      return events as unknown as (DateBasedEvent | TimeBasedEvent)[];
    },
    enabled: !!rsvps.length,
    retry: 1,
    staleTime: 30000,
  });

  const {
    data: userCalendars = [],
    isLoading: isLoadingCalendars,
  } = useUserCalendars(pubkey);

  const metadata = author.data?.metadata;
  const displayName =
    metadata?.name || metadata?.display_name || pubkey?.slice(0, 8) || "";
  const profileImage = metadata?.picture;
  const about = metadata?.about;
  const website = metadata?.website;
  const nip05 = metadata?.nip05;
  const lightningAddress = metadata?.lud16 || metadata?.lud06;

  const isOwnProfile = user?.pubkey === pubkey;

  // Handle invalid npub
  if (!pubkey) {
    return (
      <div className="container px-0 sm:px-4 py-2 sm:py-6">
        <Card className="rounded-none sm:rounded-lg">
          <CardContent className="p-6 text-center">
            <p className="text-destructive">Invalid profile address</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show profile info immediately when available, even if other sections are loading
  return (
    <div className="container px-0 sm:px-4 py-2 sm:py-6 space-y-3 sm:space-y-6">
      {/* Profile Info Card */}
      <Card className="rounded-none sm:rounded-lg">
        <CardHeader className="relative p-3 sm:p-6">
          {/* Action menu positioned absolutely in top right corner */}
          {user && !isOwnProfile && pubkey && (
            <div className="absolute top-3 right-3 sm:top-6 sm:right-6 z-10">
              <UserActionsMenu pubkey={pubkey} authorName={displayName} />
            </div>
          )}

          {/* Edit profile button for own profile */}
          {user && isOwnProfile && (
            <div className="absolute top-3 right-3 sm:top-6 sm:right-6 z-10">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl w-full sm:w-[500px] md:w-[600px] lg:w-[700px] max-h-[90vh] overflow-y-auto p-0 sm:p-8">
                  <DialogHeader>
                    <DialogTitle>Edit Profile</DialogTitle>
                    <DialogDescription>
                      Update your profile information and broadcast changes to
                      the Nostr network.
                    </DialogDescription>
                  </DialogHeader>
                  <EditProfileForm />
                </DialogContent>
              </Dialog>
            </div>
          )}

          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
              {author.isLoading ? (
                <div className="w-full h-full bg-muted animate-pulse rounded-full" />
              ) : (
                <>
                  <AvatarImage src={profileImage} alt={displayName} />
                  <AvatarFallback className="text-lg">
                    {displayName.slice(0, 2).toUpperCase() || "?"}
                  </AvatarFallback>
                </>
              )}
            </Avatar>
            <div className="space-y-2">
              <CardTitle className="text-xl sm:text-2xl pr-12 sm:pr-0">
                {author.isLoading ? (
                  <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                ) : (
                  displayName || "Unknown User"
                )}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                {author.isLoading ? (
                  <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                ) : (
                  <>
                    {nip05 && (
                      <Badge variant="secondary" className="font-mono text-xs">
                        ✓ {nip05}
                      </Badge>
                    )}
                    {lightningAddress && user && !isOwnProfile ? (
                      <ZappableLightningAddress
                        lightningAddress={lightningAddress}
                        pubkey={pubkey}
                        displayName={displayName}
                        eventKind={0}
                      />
                    ) : lightningAddress ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        ⚡ {lightningAddress}
                      </Badge>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 space-y-3 sm:space-y-6">
          {/* About section - show immediately when available */}
          {author.isLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              <div className="h-4 w-full bg-muted animate-pulse rounded" />
              <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
            </div>
          ) : about ? (
            <div>
              <h3 className="font-semibold mb-2">About</h3>
              <p className="text-muted-foreground">{about}</p>
            </div>
          ) : null}

          {/* Website section - show immediately when available */}
          {!author.isLoading && website && (
            <div>
              <h3 className="font-semibold mb-2">Website</h3>
              <a
                href={
                  website.startsWith("http") ? website : `https://${website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                {website}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Stats section */}
          {!author.isLoading && !isLoadingCreated && (
            <div className="flex flex-wrap gap-4 sm:gap-8 mt-4">
              <div className="flex flex-col bg-muted/30 p-3 sm:p-4 rounded-2xl flex-1 items-center justify-center min-w-[100px] shadow-sm">
                <span className="text-2xl sm:text-3xl font-bold text-primary">{createdEvents.length}</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest font-bold text-center mt-1">Total Events</span>
              </div>
              <div className="flex flex-col bg-muted/30 p-3 sm:p-4 rounded-2xl flex-1 items-center justify-center min-w-[100px] shadow-sm">
                <span className="text-2xl sm:text-3xl font-bold text-primary">
                  {createdEvents.filter((event) => {
                    const startTag = event.tags.find((t) => t[0] === "start")?.[1];
                    if (!startTag) return false;

                    try {
                      let startTimeMs = 0;
                      if (event.kind === 31922) {
                        // YYYY-MM-DD
                        startTimeMs = new Date(startTag).getTime();
                      } else if (event.kind === 31923) {
                        // Unix timestamp in seconds
                        startTimeMs = parseInt(startTag) * 1000;
                      }

                      // For current/upcoming events, we check if start time is in the future
                      // Note: We could also check end time if available to include ongoing events
                      const endTag = event.tags.find((t) => t[0] === "end")?.[1];
                      if (endTag) {
                        let endTimeMs = 0;
                        if (event.kind === 31922) {
                          endTimeMs = new Date(endTag).getTime();
                        } else if (event.kind === 31923) {
                          endTimeMs = parseInt(endTag) * 1000;
                        }
                        // If end time is in future or today
                        return endTimeMs >= Date.now();
                      }

                      // If no end time, we consider it current if it's within the last 24h or in the future
                      // Just subtracting 24h as a rough buffer for ongoing "day of" events
                      return startTimeMs >= Date.now() - 24 * 60 * 60 * 1000;
                    } catch (e) {
                      return false;
                    }
                  }).length}
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest font-bold text-center mt-1">Current Events</span>
              </div>
              <div className="flex flex-col bg-muted/30 p-3 sm:p-4 rounded-2xl flex-1 items-center justify-center min-w-[100px] shadow-sm">
                {isLoadingRSVPs ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground my-1" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold text-primary">
                    {rsvps.filter(r => r.tags.find(t => t[0] === "status")?.[1] === "accepted").length}
                  </span>
                )}
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest font-bold text-center mt-1">Attending</span>
              </div>
              <div className="flex flex-col bg-muted/30 p-3 sm:p-4 rounded-2xl flex-1 items-center justify-center min-w-[100px] shadow-sm">
                {isLoadingReceivedRsvps ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground my-1" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-bold text-primary">
                    {
                      // Filter down to accepted RSVPs and get unique pubkeys
                      Array.from(new Set(
                        receivedRsvps
                          .filter(r => r.tags.find(t => t[0] === "status")?.[1] === "accepted")
                          .map(r => r.pubkey)
                      )).length
                    }
                  </span>
                )}
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest font-bold text-center mt-1">Total Attendees</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Separator between profile info and events */}
      <div className="py-2"><hr className="border-border" /></div>

      {/* Events Section: Tabs for Created and RSVP'd Events */}
      <Tabs defaultValue="created" className="w-full">
        <TabsList className="flex flex-wrap gap-2 mb-6">
          <TabsTrigger value="created" className="flex items-center gap-2"><PartyPopper className="h-5 w-5 text-primary" /> Created Events</TabsTrigger>
          <TabsTrigger value="rsvpd" className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> RSVP'd Events</TabsTrigger>
          <TabsTrigger value="calendars" className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> My Calendars</TabsTrigger>
        </TabsList>
        <TabsContent value="created">
          {isLoadingCreated ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading events...</span>
            </div>
          ) : createdEventsError ? (
            <p className="text-muted-foreground">Unable to load created events</p>
          ) : createdEvents.length === 0 ? (
            <p className="text-muted-foreground">No events created yet</p>
          ) : (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {createdEvents.map((event) => {
                const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
                const description = event.content;
                const startTime = event.tags.find((tag) => tag[0] === "start")?.[1];
                const location = event.tags.find((tag) => tag[0] === "location")?.[1];
                const imageUrl = event.tags.find((tag) => tag[0] === "image")?.[1];
                const eventIdentifier = createEventIdentifier(event);
                return (
                  <Link to={`/event/${eventIdentifier}`} key={event.id}>
                    <Card className="h-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 overflow-hidden rounded-none sm:rounded-3xl border-2 border-transparent hover:border-primary/20 group">
                      <div className="aspect-video w-full overflow-hidden relative">
                        <img
                          src={imageUrl || "/default-calendar.png"}
                          alt={title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      <CardHeader className="p-4 sm:p-6">
                        <CardTitle className="text-lg sm:text-xl line-clamp-2 group-hover:text-primary transition-colors duration-200">
                          {title}
                        </CardTitle>
                        {startTime && (
                          <div className="text-sm font-medium">
                            <TimezoneDisplay event={event} showLocalTime={false} />
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6 pt-0">
                        <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                          {description}
                        </p>
                        {location && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-xl">
                            <span className="text-primary">📍</span>
                            <span className="font-medium">{location}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="calendars">
          {isLoadingCalendars ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading calendars...</span>
            </div>
          ) : userCalendars.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed bg-muted/20">
              <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-1">No Calendars Yet</h3>
              <p className="text-muted-foreground mb-4">You haven't created any group calendars yet.</p>
              {isOwnProfile && (
                <Button asChild>
                  <Link to="/create-calendar">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Calendar
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {isOwnProfile && (
                <div className="flex justify-end">
                  <Button asChild variant="outline">
                    <Link to="/create-calendar">
                      <Plus className="h-4 w-4 mr-2" />
                      New Calendar
                    </Link>
                  </Button>
                </div>
              )}
              <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {userCalendars.map((cal) => (
                  <Link to={`/calendar/${cal.pubkey}:${cal.d}`} key={cal.id}>
                    <Card className="h-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 overflow-hidden rounded-none sm:rounded-3xl border-2 border-transparent hover:border-primary/20 group">
                      <div className="aspect-video w-full overflow-hidden relative bg-muted">
                        <img
                          src={cal.image || "/default-calendar.png"}
                          alt={cal.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-100 transition-opacity duration-300" />
                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="text-white font-bold text-lg line-clamp-1">{cal.title}</h3>
                        </div>
                      </div>
                      <CardContent className="p-4 sm:p-6">
                        <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                          {cal.description || "No description provided."}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="rsvpd">
          {isLoadingRSVPs ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading RSVPs...</span>
            </div>
          ) : rsvpsError ? (
            <p className="text-muted-foreground">Unable to load RSVPs</p>
          ) : rsvps.length === 0 ? (
            <p className="text-muted-foreground">No RSVPs yet</p>
          ) : isLoadingRsvpEvents ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading RSVP event details...</span>
            </div>
          ) : rsvpEventsError ? (
            <p className="text-muted-foreground">Unable to load RSVP event details</p>
          ) : (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {rsvps.map((rsvp) => {
                const eventId = rsvp.tags.find((tag) => tag[0] === "e")?.[1];
                const status = rsvp.tags.find((tag) => tag[0] === "status")?.[1];
                const event = rsvpEvents.find((e) => e.id === eventId);
                if (!eventId || !event) return null;
                const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
                const description = event.content;
                const startTime = event.tags.find((tag) => tag[0] === "start")?.[1];
                const location = event.tags.find((tag) => tag[0] === "location")?.[1];
                const imageUrl = event.tags.find((tag) => tag[0] === "image")?.[1];
                const eventIdentifier = createEventIdentifier(event);
                return (
                  <Link to={`/event/${eventIdentifier}`} key={rsvp.id}>
                    <Card className="h-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 overflow-hidden rounded-none sm:rounded-3xl border-2 border-transparent hover:border-primary/20 group">
                      <div className="aspect-video w-full overflow-hidden relative">
                        <img
                          src={imageUrl || "/default-calendar.png"}
                          alt={title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      <CardHeader className="p-4 sm:p-6">
                        <CardTitle className="text-lg sm:text-xl line-clamp-2 group-hover:text-primary transition-colors duration-200">
                          {title}
                        </CardTitle>
                        {startTime && (
                          <div className="text-sm font-medium">
                            <TimezoneDisplay event={event} showLocalTime={false} />
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-2 mt-2">
                          <Badge
                            variant="outline"
                            className={
                              status === "accepted"
                                ? "bg-green-500/10 text-green-500"
                                : status === "tentative"
                                  ? "bg-yellow-500/10 text-yellow-500"
                                  : "bg-red-500/10 text-red-500"
                            }
                          >
                            {status === "accepted"
                              ? "Going"
                              : status === "tentative"
                                ? "Maybe"
                                : "Can't Go"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6 pt-0">
                        <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                          {description}
                        </p>
                        {location && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-xl">
                            <span className="text-primary">📍</span>
                            <span className="font-medium">{location}</span>
                          </div>
                        )}
                        {rsvp.content && (
                          <p className="text-muted-foreground text-sm mt-2">
                            Your note: {rsvp.content}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
