import { useParams } from "react-router-dom";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useProfileTheme } from "@/hooks/useProfileTheme";
import { getAvatarShape } from "@/lib/avatarShapes";
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
import { EventThemeProvider } from "@/components/EventThemeProvider";
import { ExternalLink, Loader2, Settings, PartyPopper, Users } from "lucide-react";
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
        const decoded = nip19.decode(npub);
        if (decoded.type === "npub") {
          setPubkey(decoded.data);
        }
      }
    } catch (error) {
      console.error("Error decoding npub:", error);
    }
  }, [npub]);

  // Primary author data - show this ASAP
  const author = useAuthor(pubkey);
  const { data: profileTheme } = useProfileTheme(pubkey);

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

  const metadata = author.data?.metadata;
  const displayName =
    metadata?.name || metadata?.display_name || pubkey?.slice(0, 8) || "";
  const profileImage = metadata?.picture;
  const shape = getAvatarShape(metadata);
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
  const content = (
    <div className="container px-0 sm:px-4 py-2 sm:py-6 space-y-3 sm:space-y-6">
      {/* Profile Info Card */}
      <Card className="rounded-none sm:rounded-3xl overflow-hidden">
        {/* Banner */}
        {metadata?.banner ? (
          <div className="aspect-[3/1] w-full overflow-hidden">
            <img
              src={metadata.banner}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className="aspect-[3/1] w-full"
            style={{
              background: profileTheme
                ? `linear-gradient(135deg, hsl(${profileTheme.colors.primary}) 0%, hsl(${profileTheme.colors.background}) 100%)`
                : "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.4) 100%)",
            }}
          />
        )}

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

          {/* Avatar overlapping the banner */}
          <div className="-mt-14 sm:-mt-16 mb-3">
            <Avatar className="h-20 w-20 sm:h-24 sm:w-24 ring-4 ring-background" shape={shape}>
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
          </div>

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
        </CardContent>
      </Card>

      {/* Separator between profile info and events */}
      <div className="py-2"><hr className="border-border" /></div>

      {/* Events Section: Tabs for Created and RSVP'd Events */}
      <Tabs defaultValue="created" className="w-full">
        <TabsList className="flex gap-2 mb-6">
          <TabsTrigger value="created" className="flex items-center gap-2"><PartyPopper className="h-5 w-5 text-primary" /> Created Events</TabsTrigger>
          <TabsTrigger value="rsvpd" className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> RSVP'd Events</TabsTrigger>
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

  if (profileTheme) {
    return <EventThemeProvider theme={profileTheme}>{content}</EventThemeProvider>;
  }

  return content;
}
