import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@/hooks/useNostr";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { nip19 } from "nostr-tools";
import { createEventIdentifier } from "@/lib/nip19Utils";
import { CalendarDays, MapPin, Plus, LayoutGrid, Trash2, Loader2, AlertCircle, FileUp, Inbox, X, Edit } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TimezoneDisplay } from "@/components/TimezoneDisplay";
import { MonthlyCalendarView } from "@/components/MonthlyCalendarView";
import { SubmitToGroupCalendarDialog } from "@/components/SubmitToGroupCalendarDialog";
import { toast } from "sonner";
import { parseCalendarEvent, deleteCalendarEvent, addEventToCalendar, rejectEventFromCalendar } from "@/lib/calendarUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function CalendarView() {
  const { naddr } = useParams(); // URL param should be the 'd' identifier or coordinate
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutate: createEvent } = useNostrPublish();
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);

  // Parse pubkey and d tag from the url param
  let queryPubkey: string | null = null;
  let queryD: string | null = null;

  try {
    if (naddr && naddr.startsWith('naddr')) {
      const { type, data } = nip19.decode(naddr);
      if (type === 'naddr') {
        queryPubkey = data.pubkey;
        queryD = data.identifier;
      }
    } else {
      const parts = naddr?.split(':') || [];
      if (parts.length === 3) {
        queryPubkey = parts[1];
        queryD = parts[2];
      } else if (parts.length === 2) {
        queryPubkey = parts[0];
        queryD = parts[1];
      } else {
        queryD = naddr || null;
      }
    }
  } catch (error) {
    console.error("Failed to parse calendar coordinate:", error);
  }

  const isOwner = user?.pubkey === queryPubkey;
  const [showPending, setShowPending] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [localApproved, setLocalApproved] = useState<string[]>([]);
  const [localRejected, setLocalRejected] = useState<string[]>([]);

  const handleDeleteCalendar = async () => {
    if (!calendarCoordinate || !isOwner) return;

    setIsDeleting(true);
    try {
      await deleteCalendarEvent(nostr, createEvent, calendarCoordinate);
      toast.success("Calendar deleted successfully");
      setIsDeleteDialogOpen(false);

      // Clear the cache for the calendars so the profile page refetches immediately
      queryClient.invalidateQueries({ queryKey: ['calendars'] });

      // Navigate back to the user's profile using npub or fallback to pubkey
      let targetProfile = (user as any)?.npub;
      if (!targetProfile && user?.pubkey) {
        targetProfile = nip19.npubEncode(user.pubkey);
      }

      if (targetProfile) {
        navigate(`/profile/${targetProfile}`);
      } else {
        navigate('/profile');
      }
    } catch (error: any) {
      console.error("Failed to delete calendar:", error);
      toast.error(error.message || "Failed to delete calendar");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApproveEvent = async (eventCoordinateToApprove: string) => {
    if (!calendarCoordinate || !isOwner) return;
    setApprovingId(eventCoordinateToApprove);

    try {
      await addEventToCalendar(nostr, createEvent, calendarCoordinate, eventCoordinateToApprove);

      // Optimistic UI update: instantly merge the newly approved coordinate into local display state
      setLocalApproved(prev => [...prev, eventCoordinateToApprove]);

      toast.success("Event officially added to your calendar!");

      // Still invalidate to ensure eventual consistency
      queryClient.invalidateQueries({ queryKey: ['calendarEvents', calendarCoordinate] });
      queryClient.invalidateQueries({ queryKey: ['calendar', naddr] });
    } catch (error: any) {
      console.error("Failed to approve event:", error);
      toast.error(error.message || "Failed to approve event");
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectEvent = async (eventCoordinateToReject: string) => {
    if (!calendarCoordinate || !isOwner) return;
    setRejectingId(eventCoordinateToReject);

    try {
      await rejectEventFromCalendar(nostr, createEvent, calendarCoordinate, eventCoordinateToReject);

      // Optimistic UI update: instantly merge the newly rejected coordinate into local display state
      setLocalRejected(prev => [...prev, eventCoordinateToReject]);

      toast.success("Event rejected and removed from inbox.");

      // Still invalidate to ensure eventual consistency
      queryClient.invalidateQueries({ queryKey: ['calendarEvents', calendarCoordinate] });
      queryClient.invalidateQueries({ queryKey: ['calendar', naddr] });
    } catch (error: any) {
      console.error("Failed to reject event:", error);
      toast.error(error.message || "Failed to reject event");
    } finally {
      setRejectingId(null);
    }
  };

  const { data: calendarData, isLoading: isLoadingCalendar } = useQuery({
    queryKey: ['calendar', naddr],
    enabled: !!nostr && !!queryD,
    queryFn: async () => {
      const filter: any = { kinds: [31924] };

      if (queryD) {
        filter['#d'] = [queryD];
      }
      if (queryPubkey) {
        filter.authors = [queryPubkey];
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let events: any[] = [];
      try {
        events = await nostr.query([filter], { signal: controller.signal });
      } catch (err) {
        console.warn("Calendar query failed:", err);
      } finally {
        clearTimeout(timeoutId);
      }

      if (!events || events.length === 0) return null;

      // Sort to get the latest version of the calendar data
      events.sort((a: any, b: any) => b.created_at - a.created_at);

      return parseCalendarEvent(events[0]);
    }
  });

  const calendarCoordinate = calendarData
    ? `31924:${calendarData.pubkey}:${calendarData.d}`
    : null;

  // Query events that reference this calendar via an `a` tag OR events specifically included by the calendar
  const { data = { approved: [], pending: [] }, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['calendarEvents', calendarCoordinate, calendarData?.events],
    enabled: !!nostr && !!calendarCoordinate && !!calendarData,
    queryFn: async () => {
      // 1. Find events that declare they belong to this calendar
      const baseFilter: any = {
        kinds: [31922, 31923],
        '#a': [calendarCoordinate!]
      };

      const filters: any[] = [baseFilter];

      // 2. Add auto-include tag queries
      if (calendarData!.hashtags && calendarData!.hashtags.length > 0) {
        filters.push({
          kinds: [31922, 31923],
          '#t': calendarData!.hashtags
        });
      }

      if (calendarData!.locations && calendarData!.locations.length > 0) {
        // Send a separate filter for EACH location to avoid relay confusion with array of strings
        calendarData!.locations.forEach((loc) => {
          if (loc && loc.trim() !== '') {
            filters.push({
              kinds: [31922, 31923],
              '#location': [loc]
            });
          }
        });
      }

      // 3. Map explicit events that this calendar references
      const explicitRefs = calendarData!.events || [];
      const rejectedRefs = calendarData!.rejected || [];
      const explicitIds: string[] = [];

      for (const ref of explicitRefs) {
        if (ref.includes(':')) {
          const parts = ref.split(':');
          if (parts.length === 3) {
            filters.push({
              kinds: [parseInt(parts[0])],
              authors: [parts[1]],
              '#d': [parts[2]]
            });
          }
        } else {
          explicitIds.push(ref);
        }
      }

      if (explicitIds.length > 0) {
        filters.push({
          kinds: [31922, 31923],
          ids: explicitIds
        });
      }

      // Log the filters being sent out so we can debug them in the console
      console.log("Calendar View: Fetching with filters:", filters);

      // Only run the query if we have actual filters to fetch from
      if (filters.length === 0) {
        return { approved: [], pending: [] };
      }

      // Add an AbortController timeout to stop waiting for EOSE if relays stall
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let events: any[] = [];
      try {
        events = await nostr.query(filters, { signal: controller.signal });
      } catch (err) {
        console.warn("Calendar View query failed or timed out:", err);
      } finally {
        clearTimeout(timeoutId);
      }

      // Deduplicate raw nostr events by their ID
      const uniqueEventsMap = new Map();
      events.forEach((e: any) => uniqueEventsMap.set(e.id, e));
      const deduplicatedEvents = Array.from(uniqueEventsMap.values());

      // Sort chronological
      const sortedEvents = deduplicatedEvents.sort((a: any, b: any) => {
        const timeA = a.tags.find((t: any) => t[0] === 'start')?.[1];
        const timeB = b.tags.find((t: any) => t[0] === 'start')?.[1];

        const parseTime = (val: string | undefined, created: number) => {
          if (!val) return created * 1000;
          if (val.includes('-')) {
            const [y, m, d] = val.split('-');
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getTime();
          }
          return parseInt(val) * 1000;
        };

        return parseTime(timeA, a.created_at) - parseTime(timeB, b.created_at);
      });

      // Segregate into Approved vs Pending
      // Approved = implicitly in the calendarData.events array or matching auto-include filters
      const approved: any[] = [];
      const pending: any[] = [];

      sortedEvents.forEach((event: any) => {
        const isReplaceable = event.kind >= 30000 && event.kind < 40000;
        const dTag = event.tags.find((t: string[]) => t[0] === 'd')?.[1];
        const coord = isReplaceable && dTag ? `${event.kind}:${event.pubkey}:${dTag}` : event.id;

        const isExplicitlyApproved = explicitRefs.includes(coord) || explicitRefs.includes(event.id);
        const isExplicitlyRejected = rejectedRefs.includes(coord) || rejectedRefs.includes(event.id);

        let hasHashtagMatch = false;
        let hasLocationMatch = false;

        const hasHashtagFilters = !!(calendarData!.hashtags && calendarData!.hashtags.length > 0);
        const hasLocationFilters = !!(calendarData!.locations && calendarData!.locations.length > 0);

        if (hasHashtagFilters) {
          const eventHashtags = event.tags.filter((t: any) => t[0] === 't').map((t: any) => t[1].toLowerCase());
          hasHashtagMatch = calendarData!.hashtags!.some((tag: string) => eventHashtags.includes(tag.toLowerCase()));
        } else {
          // If no hashtag filters exist, we consider it a "match" for the sake of AND logic
          hasHashtagMatch = true;
        }

        if (hasLocationFilters) {
          const eventLocation = event.tags.find((t: any) => t[0] === 'location')?.[1]?.toLowerCase();
          hasLocationMatch = !!(eventLocation && calendarData!.locations!.some((loc: string) => eventLocation.includes(loc.toLowerCase())));
        } else {
          // If no location filters exist, we consider it a "match" for the sake of AND logic
          hasLocationMatch = true;
        }

        let isAutoIncluded = false;

        // Only process auto-include logic if at least one filter actually exists
        if (hasHashtagFilters || hasLocationFilters) {
          if (calendarData!.matchType === 'all') {
            isAutoIncluded = hasHashtagMatch && hasLocationMatch;
          } else {
            // "any" mode - default
            isAutoIncluded = Boolean((hasHashtagFilters && hasHashtagMatch) || (hasLocationFilters && hasLocationMatch));
          }
        }

        if (isExplicitlyApproved || (isAutoIncluded && !isExplicitlyRejected)) {
          approved.push(event);
        } else if (!isExplicitlyRejected) {
          pending.push(event);
        }
      });

      return { approved, pending };
    }
  });

  // Apply local optimistic overrides to bypass relay lag
  const displayApproved = data.approved.concat(
    data.pending.filter((e: any) => {
      const isReplaceable = e.kind >= 30000 && e.kind < 40000;
      const dTag = e.tags.find((t: string[]) => t[0] === 'd')?.[1];
      const coord = isReplaceable && dTag ? `${e.kind}:${e.pubkey}:${dTag}` : e.id;
      return localApproved.includes(coord) || localApproved.includes(e.id);
    })
  );

  const displayPending = data.pending.filter((e: any) => {
    const isReplaceable = e.kind >= 30000 && e.kind < 40000;
    const dTag = e.tags.find((t: string[]) => t[0] === 'd')?.[1];
    const coord = isReplaceable && dTag ? `${e.kind}:${e.pubkey}:${dTag}` : e.id;
    return !localApproved.includes(coord) && !localApproved.includes(e.id) &&
      !localRejected.includes(coord) && !localRejected.includes(e.id);
  });

  const activeEventsList = showPending ? displayPending : displayApproved;

  if (isLoadingCalendar) {
    return (
      <div className="container py-12 flex justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!calendarData) {
    return (
      <div className="container py-12 text-center text-muted-foreground">
        <h2>Calendar not found</h2>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-8 animate-in fade-in duration-500">
      <Card className="overflow-hidden border-2 bg-gradient-to-br from-card to-card/50">
        {calendarData.image ? (
          <div className="h-48 md:h-64 w-full bg-muted relative">
            <img
              src={calendarData.image}
              alt={calendarData.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 left-6 right-6 text-white">
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                {calendarData.title}
              </h1>
            </div>
          </div>
        ) : (
          <div className="p-6 md:p-8 border-b">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <CalendarDays className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  {calendarData.title}
                </h1>
              </div>
            </div>
          </div>
        )}

        {calendarData.description && (
          <CardContent className="p-6 md:p-8 pt-6">
            <p className="text-lg text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {calendarData.description}
            </p>
          </CardContent>
        )}

        {isOwner && (
          <div className="bg-muted/30 border-t p-4 flex justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/edit-calendar/${calendarCoordinate}`)}
              className="transition-colors"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Calendar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="text-destructive hover:bg-destructive hover:text-white transition-colors"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Calendar
            </Button>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Upcoming Events
          </h2>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex bg-muted/50 p-1 rounded-full border">
              <Button
                variant={viewMode === "list" && !showPending ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full px-3"
                onClick={() => {
                  setViewMode("list");
                  setShowPending(false);
                }}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Feed
              </Button>
              <Button
                variant={viewMode === "calendar" && !showPending ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full px-3"
                onClick={() => {
                  setViewMode("calendar");
                  setShowPending(false);
                }}
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                Month
              </Button>
              {isOwner && (
                <Button
                  variant={showPending ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-full px-3 relative"
                  onClick={() => setShowPending(true)}
                >
                  <Inbox className="h-4 w-4 mr-2" />
                  Inbox
                  {displayPending.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {displayPending.length}
                    </span>
                  )}
                </Button>
              )}
            </div>

            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to={`/create${calendarCoordinate ? `?calendar=${calendarCoordinate}` : ''}`}>
                <Plus className="h-4 w-4 mr-1" />
                Add Event
              </Link>
            </Button>

            {user && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setIsSubmitDialogOpen(true)}
              >
                <FileUp className="h-4 w-4 mr-1" />
                Submit Existing
              </Button>
            )}
          </div>
        </div>

        {isLoadingEvents ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : activeEventsList.length > 0 ? (
          viewMode === "calendar" && !showPending ? (
            <MonthlyCalendarView events={activeEventsList as any[]} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
              {activeEventsList.map((event: any) => {
                const title = event.tags.find((tag: string[]) => tag[0] === "title")?.[1] || "Untitled";
                const description = event.content;
                const startTime = event.tags.find((tag: string[]) => tag[0] === "start")?.[1];
                const location = event.tags.find((tag: string[]) => tag[0] === "location")?.[1];
                const imageUrl = event.tags.find((tag: string[]) => tag[0] === "image")?.[1];
                const eventIdentifier = createEventIdentifier(event);

                const isReplaceable = event.kind >= 30000 && event.kind < 40000;
                const dTag = event.tags.find((t: string[]) => t[0] === 'd')?.[1];
                const activeEventCoordinate = isReplaceable && dTag ? `${event.kind}:${event.pubkey}:${dTag}` : event.id;

                const isApproving = approvingId === activeEventCoordinate;
                const isRejecting = rejectingId === activeEventCoordinate;

                const CardContentBlock = (
                  <Card className={`h-full transition-all duration-300 overflow-hidden rounded-none sm:rounded-3xl border-2 ${showPending ? 'border-primary/40' : 'border-transparent hover:border-primary/20 hover:scale-105 hover:shadow-xl hover:shadow-primary/20'} group`}>
                    <div className="aspect-video w-full overflow-hidden relative">
                      <img
                        src={imageUrl || "/default-calendar.png"}
                        alt={title}
                        className={`w-full h-full object-cover transition-transform duration-300 ${!showPending ? 'group-hover:scale-110' : ''}`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      {showPending && (
                        <div className="absolute top-3 right-3">
                          <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full shadow-md">
                            Pending Review
                          </span>
                        </div>
                      )}
                    </div>
                    <CardHeader className="p-4 sm:p-6 pb-2">
                      <CardTitle className="text-lg sm:text-xl line-clamp-2 group-hover:text-primary transition-colors duration-200">
                        {title}
                      </CardTitle>
                      {startTime && (
                        <div className="text-sm font-medium mt-1">
                          <TimezoneDisplay event={event} showLocalTime={false} />
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                          {description}
                        </p>
                        {location && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-xl">
                            <span className="text-primary">📍</span>
                            <span className="font-medium truncate">{location}</span>
                          </div>
                        )}
                        {showPending && event.pubkey && (
                          <div className="mt-3 text-xs text-muted-foreground">
                            Submitted by:{" "}
                            <Link
                              to={`/profile/${nip19.npubEncode(event.pubkey)}`}
                              className="font-medium text-primary hover:underline hover:text-primary/80 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {nip19.npubEncode(event.pubkey).slice(0, 16)}...
                            </Link>
                          </div>
                        )}
                      </div>

                      {showPending && (
                        <div className="mt-4 pt-4 border-t w-full flex gap-2">
                          <Button
                            className="flex-1"
                            size="sm"
                            disabled={isApproving || isRejecting}
                            onClick={(e) => {
                              e.preventDefault(); // prevent navigation
                              handleApproveEvent(activeEventCoordinate);
                            }}
                          >
                            {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-none text-destructive hover:bg-destructive hover:text-white transition-colors"
                            size="sm"
                            disabled={isApproving || isRejecting}
                            onClick={(e) => {
                              e.preventDefault(); // prevent navigation
                              handleRejectEvent(activeEventCoordinate);
                            }}
                          >
                            {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );

                if (showPending) {
                  return <div key={event.id}>{CardContentBlock}</div>;
                }

                return (
                  <Link to={`/event/${eventIdentifier}`} key={event.id}>
                    {CardContentBlock}
                  </Link>
                );
              })}
            </div>
          )
        ) : (
          <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed bg-muted/20">
            <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-1">No Events Yet</h3>
            <p className="text-muted-foreground">This calendar is currently empty.</p>
          </div>
        )}
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Delete Calendar
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete "{calendarData.title}"? This action cannot be undone.
              Only the list will be deleted, the events themselves will remain intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCalendar}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Calendar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {calendarCoordinate && (
        <SubmitToGroupCalendarDialog
          open={isSubmitDialogOpen}
          onOpenChange={setIsSubmitDialogOpen}
          calendarCoordinate={calendarCoordinate}
          rejectedCoordinates={calendarData?.rejected || []}
        />
      )}
    </div>
  );
}
