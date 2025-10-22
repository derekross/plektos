import { useEvents } from "@/lib/eventUtils";
import { useMuteList } from "@/hooks/useMuteList";
import { useAuthorsMetadata } from "@/hooks/useAuthorsMetadata";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "react-router-dom";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createEventIdentifier } from "@/lib/nip19Utils";
import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting, InteractiveRoom, EventRSVP } from "@/lib/eventTypes";
import { isLiveEvent, isInPersonEvent, getStreamingUrl, getLiveEventStatus } from "@/lib/liveEventUtils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CalendarIcon, Search, X, Filter, ChevronDown, Grid3X3, Calendar as CalendarViewIcon, Map as MapIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { EVENT_CATEGORIES, type EventCategory } from "@/lib/eventCategories";
import { TimezoneDisplay } from "@/components/TimezoneDisplay";
import { MonthlyCalendarView } from "@/components/MonthlyCalendarView";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getPlatformIcon, isLiveEventType } from "@/lib/platformIcons";
import { MapView } from "@/components/MapView";
import { LocationSearch } from "@/components/LocationSearch";
import { sortEventsByDistance, formatDistance, type Coordinates } from "@/lib/geolocation";
import { formatAmount } from "@/lib/lightning";

export function Home() {
  console.log("Home component rendering");
  const [viewMode, setViewMode] = useState<"grid" | "calendar" | "map">("grid");
  
  // Use regular loading for both views - simpler and more reliable
  const { data: allEventsData, isLoading, error } = useEvents({
    limit: 500, // Load a good amount of events
    includeRSVPs: true
  });

  const { isMuted, isLoading: isMuteListLoading } = useMuteList();

  // State for client-side pagination in grid view
  const [displayedEventCount, setDisplayedEventCount] = useState(50);
  
  const allEvents = useMemo(() => allEventsData || [], [allEventsData]);

  // Get unique pubkeys from all events for metadata lookup
  const uniquePubkeys = useMemo(() => {
    return Array.from(new Set(allEvents.map(event => event.pubkey)));
  }, [allEvents]);

  // Get metadata for all authors
  const { data: authorsMetadata = {}, isLoading: isAuthorsLoading } = useAuthorsMetadata(uniquePubkeys);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedCategories, setSelectedCategories] = useState<EventCategory[]>(
    []
  );
  const [eventTypeFilter, setEventTypeFilter] = useState<"all" | "in-person" | "live">("all");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [locationCoords, setLocationCoords] = useState<Coordinates | null>(null);
  const [sortByDistance, setSortByDistance] = useState(false);

  // Filter events based on all criteria including mute list
  const calendarEvents = allEvents?.filter((event) => {
    // Only include calendar event types
    return event.kind === 31922 || event.kind === 31923 || event.kind === 30311 || event.kind === 30312 || event.kind === 30313;
  }) as (DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom)[] | undefined;

  const allFilteredEvents = calendarEvents
    ?.filter((event) => {
      // Filter out events from muted pubkeys
      if (!isMuteListLoading && isMuted(event.pubkey)) {
        return false;
      }

      // LiveEvent (30311), InteractiveRoom (30312), and RoomMeeting (30313) use "starts" tag, others use "start"
      const startTime = (event.kind === 30311 || event.kind === 30312 || event.kind === 30313)
        ? event.tags.find((tag) => tag[0] === "starts")?.[1]
        : event.tags.find((tag) => tag[0] === "start")?.[1];
      const endTime = event.tags.find((tag) => tag[0] === "end")?.[1] || 
                      event.tags.find((tag) => tag[0] === "ends")?.[1];
      if (!startTime) return false;

      let eventStart: number;
      let eventEnd: number;

      if (event.kind === 31922) {
        // For date-only events, handle both YYYY-MM-DD and Unix timestamp formats
        // Always use local timezone for date-based events
        try {
          if (startTime.match(/^\d{10}$/)) {
            // If start time is a short Unix timestamp (10 digits)
            const startDate = new Date(parseInt(startTime) * 1000);
            if (isNaN(startDate.getTime())) {
              console.error("Invalid start date:", startTime);
              return false;
            }
            // Use local timezone for date-based events
            eventStart = new Date(
              startDate.getFullYear(),
              startDate.getMonth(),
              startDate.getDate(),
              0,
              0,
              0
            ).getTime();
            if (endTime?.match(/^\d{10}$/)) {
              const endDate = new Date(parseInt(endTime) * 1000);
              if (isNaN(endDate.getTime())) {
                console.error("Invalid end date:", endTime);
                return false;
              }
              eventEnd = new Date(
                endDate.getFullYear(),
                endDate.getMonth(),
                endDate.getDate(),
                23,
                59,
                59,
                999
              ).getTime();
            } else {
              eventEnd = new Date(
                startDate.getFullYear(),
                startDate.getMonth(),
                startDate.getDate(),
                23,
                59,
                59,
                999
              ).getTime();
            }
          } else if (startTime.match(/^\d{13}$/)) {
            // If start time is a long Unix timestamp (13 digits)
            const startDate = new Date(parseInt(startTime));
            if (isNaN(startDate.getTime())) {
              console.error("Invalid start date:", startTime);
              return false;
            }
            // Use local timezone for date-based events
            eventStart = new Date(
              startDate.getFullYear(),
              startDate.getMonth(),
              startDate.getDate(),
              0,
              0,
              0
            ).getTime();
            if (endTime?.match(/^\d{13}$/)) {
              const endDate = new Date(parseInt(endTime));
              if (isNaN(endDate.getTime())) {
                console.error("Invalid end date:", endTime);
                return false;
              }
              eventEnd = new Date(
                endDate.getFullYear(),
                endDate.getMonth(),
                endDate.getDate(),
                23,
                59,
                59,
                999
              ).getTime();
            } else {
              eventEnd = new Date(
                startDate.getFullYear(),
                startDate.getMonth(),
                startDate.getDate(),
                23,
                59,
                59,
                999
              ).getTime();
            }
          } else {
            // If start time is in YYYY-MM-DD format, parse in local timezone
            const [year, month, day] = startTime.split('-').map(Number);
            if (isNaN(year) || isNaN(month) || isNaN(day)) {
              console.error("Invalid start date format:", startTime);
              return false;
            }
            const startDate = new Date(year, month - 1, day, 0, 0, 0);
            eventStart = startDate.getTime();
            
            if (endTime && endTime !== startTime) {
              const [endYear, endMonth, endDay] = endTime.split('-').map(Number);
              if (isNaN(endYear) || isNaN(endMonth) || isNaN(endDay)) {
                console.error("Invalid end date format:", endTime);
                return false;
              }
              const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
              eventEnd = endDate.getTime();
            } else {
              const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
              eventEnd = endDate.getTime();
            }
          }
        } catch (error) {
          console.error("Error parsing dates:", error, { startTime, endTime });
          return false;
        }
      } else {
        // For time-based events (kind 31923), live events (30311), interactive rooms (30312), and room meetings (30313), convert Unix timestamps to milliseconds
        eventStart = parseInt(startTime) * 1000;
        if (endTime) {
          eventEnd = parseInt(endTime) * 1000;
        } else {
          // If no end time is specified, treat the event as lasting 2 hours from start
          // This is a reasonable default for meetings, talks, etc.
          eventEnd = eventStart + (2 * 60 * 60 * 1000); // Add 2 hours
        }
      }

      const now = Date.now();

      // Filter by past/future events - an event is past only when its end time has passed
      if (!showPastEvents && eventEnd <= now) return false;

      // Filter by date range
      if (dateRange?.from && eventStart < dateRange.from.getTime())
        return false;
      if (dateRange?.to && eventStart > dateRange.to.getTime()) return false;

      // Filter by keyword (location, username, title, description)
      if (keywordFilter) {
        const keyword = keywordFilter.toLowerCase();
        
        // Get event fields to search
        const location = event.tags.find((tag) => tag[0] === "location")?.[1]?.toLowerCase() || "";
        const title = event.tags.find((tag) => tag[0] === "title")?.[1]?.toLowerCase() || "";
        const description = event.content.toLowerCase();
        
        // Get author metadata for username search
        const authorMetadata = authorsMetadata[event.pubkey];
        const username = authorMetadata?.name?.toLowerCase() || "";
        const displayName = authorMetadata?.display_name?.toLowerCase() || "";
        
        // Check if keyword matches any of these fields
        const matchesKeyword = 
          location.includes(keyword) ||
          title.includes(keyword) ||
          description.includes(keyword) ||
          username.includes(keyword) ||
          displayName.includes(keyword);
          
        if (!matchesKeyword) return false;
      }

      // Filter by categories
      if (selectedCategories.length > 0) {
        const eventCategories = event.tags
          .filter((tag) => tag[0] === "t")
          .map((tag) => tag[1]);
        const hasMatchingCategory = selectedCategories.some((category) =>
          eventCategories.includes(category)
        );
        if (!hasMatchingCategory) return false;
      }

      // Filter by event type (in-person vs live)
      if (eventTypeFilter !== "all") {
        if (eventTypeFilter === "live" && !isLiveEvent(event)) {
          return false;
        }
        if (eventTypeFilter === "in-person" && !isInPersonEvent(event)) {
          return false;
        }
      }

      return true;
    });

  // Apply sorting - either by distance or by time
  const sortedEvents = useMemo(() => {
    if (!allFilteredEvents) return [];
    
    if (sortByDistance && locationCoords) {
      // Sort by distance from selected location
      return sortEventsByDistance(allFilteredEvents, locationCoords);
    }
    
    // Default: sort by start time
    return [...allFilteredEvents].sort((a, b) => {
      const getEventStartTime = (event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom) => {
        // LiveEvent (30311), InteractiveRoom (30312), and RoomMeeting (30313) use "starts" tag, others use "start"
        const startTime = (event.kind === 30311 || event.kind === 30312 || event.kind === 30313)
          ? event.tags.find((tag) => tag[0] === "starts")?.[1]
          : event.tags.find((tag) => tag[0] === "start")?.[1];
        if (!startTime) return 0;

        if (event.kind === 31922) {
          // For date-only events, use local timezone
          if (startTime.match(/^\d{10}$/)) {
            const startDate = new Date(parseInt(startTime) * 1000);
            return new Date(
              startDate.getFullYear(),
              startDate.getMonth(),
              startDate.getDate(),
              0,
              0,
              0
            ).getTime();
          } else if (startTime.match(/^\d{13}$/)) {
            const startDate = new Date(parseInt(startTime));
            return new Date(
              startDate.getFullYear(),
              startDate.getMonth(),
              startDate.getDate(),
              0,
              0,
              0
            ).getTime();
          } else {
            // YYYY-MM-DD format, parse in local timezone
            const [year, month, day] = startTime.split('-').map(Number);
            if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
            return new Date(year, month - 1, day, 0, 0, 0).getTime();
          }
        } else {
          // For time-based events (kind 31923), live events (30311), interactive rooms (30312), and room meetings (30313), convert Unix timestamps to milliseconds
          return parseInt(startTime) * 1000;
        }
      };

      return getEventStartTime(a) - getEventStartTime(b);
    });
  }, [allFilteredEvents, sortByDistance, locationCoords]);

  // For grid view, limit the displayed events for pagination
  const filteredEvents = viewMode === "calendar" || viewMode === "map"
    ? sortedEvents 
    : sortedEvents?.slice(0, displayedEventCount);

  const clearFilters = () => {
    setShowPastEvents(false);
    setKeywordFilter("");
    setDateRange(undefined);
    setSelectedCategories([]);
    setEventTypeFilter("all");
    setLocationFilter("");
    setLocationCoords(null);
    setSortByDistance(false);
  };

  const hasActiveFilters =
    keywordFilter ||
    dateRange ||
    showPastEvents ||
    selectedCategories.length > 0 ||
    eventTypeFilter !== "all" ||
    locationFilter ||
    sortByDistance;

  // Load more functionality for grid view
  const canLoadMore = viewMode === "grid" && sortedEvents && displayedEventCount < sortedEvents.length;
  
  const loadMoreEvents = () => {
    setDisplayedEventCount(prev => prev + 50);
  };

  // Infinite scroll observer for grid view
  const observer = useRef<IntersectionObserver>();
  const lastEventElementRef = useCallback((node: HTMLElement | null) => {
    if (isLoading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && canLoadMore) {
        console.log("Loading more events via intersection observer...");
        loadMoreEvents();
      }
    }, {
      threshold: 0.1,
      rootMargin: '100px'
    });
    
    if (node) observer.current.observe(node);
  }, [isLoading, canLoadMore]);

  useEffect(() => {
    console.log("Home component mounted");
    console.log("Events state:", { 
      calendarEvents: calendarEvents?.length || 0, 
      allFilteredEvents: allFilteredEvents?.length || 0,
      displayedEvents: filteredEvents?.length || 0,
      displayedEventCount,
      canLoadMore,
      isLoading, 
      error,
      viewMode
    });

    // Debug: Check for duplicate events
    if (calendarEvents && calendarEvents.length > 0) {
      const eventCoordinates = new Map<string, number>();
      const duplicates: string[] = [];
      
      calendarEvents.forEach(event => {
        const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];
        if (dTag) {
          const coordinate = `${event.kind}:${event.pubkey}:${dTag}`;
          const count = eventCoordinates.get(coordinate) || 0;
          eventCoordinates.set(coordinate, count + 1);
          if (count > 0) {
            duplicates.push(coordinate);
          }
        }
      });
      
      if (duplicates.length > 0) {
        console.warn("🚨 DUPLICATE EVENTS DETECTED:", duplicates);
        console.warn("Event coordinates with counts:", Array.from(eventCoordinates.entries()).filter(([_, count]) => count > 1));
      } else {
        console.log("✅ No duplicate events detected");
      }
    }
  }, [calendarEvents, allFilteredEvents, filteredEvents, displayedEventCount, canLoadMore, isLoading, error, viewMode]);

  if (isLoading || isMuteListLoading || isAuthorsLoading) {
    console.log("Loading events...");
    return <Spinner />;
  }

  if (error) {
    console.error("Error loading events:", error);
    const errorMessage = error && typeof error === 'object' && 'message' in error 
      ? (error as Error).message 
      : String(error);
    return <div>Error loading events: {errorMessage}</div>;
  }

  console.log("Rendering events:", {
    calendarEventsLength: calendarEvents?.length || 0,
    allFilteredEventsLength: allFilteredEvents?.length || 0,
    displayedEventsLength: filteredEvents?.length || 0,
    displayedEventCount,
    canLoadMore,
    viewMode
  });

  return (
    <div className="container px-0 sm:px-4 py-2 sm:py-6 space-y-3 sm:space-y-6">
      <div className="px-3 sm:px-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Discover Events 🎉
            </h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Find your next adventure, connect with your community
            </p>
          </div>
          
          {/* View Mode Toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) setViewMode(value as "grid" | "calendar" | "map");
            }}
            className="justify-start sm:justify-end bg-muted/50 rounded-2xl p-1"
          >
            <ToggleGroupItem 
              value="grid" 
              aria-label="Grid view" 
              className="gap-2 rounded-xl data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all duration-200"
            >
              <Grid3X3 className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">Grid</span>
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="calendar" 
              aria-label="Calendar view" 
              className="gap-2 rounded-xl data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all duration-200"
            >
              <CalendarViewIcon className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">Calendar</span>
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="map" 
              aria-label="Map view" 
              className="gap-2 rounded-xl data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all duration-200"
            >
              <MapIcon className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">Map</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-none sm:rounded-2xl border-2 border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5">
        <Collapsible
          open={isFiltersOpen}
          onOpenChange={setIsFiltersOpen}
          className="w-full"
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 sm:p-6 cursor-pointer hover:bg-primary/5 transition-all duration-200 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Filter className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="font-semibold text-lg">Find Your Perfect Event</span>
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-3 bg-primary/20 text-primary border-primary/30">
                      Filters Active
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering the CollapsibleTrigger
                      clearFilters();
                    }}
                    className="h-9 px-3 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                )}
                <ChevronDown
                  className={cn(
                    "h-5 w-5 transition-transform duration-300 text-primary",
                    isFiltersOpen && "transform rotate-180"
                  )}
                />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-3 sm:space-y-4">
              <div className="flex flex-col gap-3 sm:gap-4">
                {/* Keyword Filter */}
                <div className="flex-1 space-y-3">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    Search Events
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      placeholder="Find parties, meetups, conferences..."
                      value={keywordFilter}
                      onChange={(e) => setKeywordFilter(e.target.value)}
                      className="pl-12 py-3 text-base rounded-2xl border-2 focus:border-primary transition-all duration-200"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-xl">
                    💡 Search across event titles, descriptions, locations, and organizer names
                  </div>
                </div>

                {/* Location Filter */}
                <div className="flex-1 space-y-3">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <MapIcon className="h-4 w-4 text-primary" />
                    Filter by Location
                  </Label>
                  <LocationSearch
                    value={locationFilter}
                    onChange={setLocationFilter}
                    onLocationSelect={(location) => {
                      setLocationCoords({ lat: location.lat, lng: location.lng });
                      setSortByDistance(true);
                    }}
                    className="w-full"
                  />
                  {locationCoords && sortByDistance && (
                    <div className="flex items-center justify-between bg-primary/10 p-3 rounded-xl">
                      <div className="text-sm text-primary">
                        📍 Sorting by distance from {locationFilter.split(',')[0]}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setLocationFilter("");
                          setLocationCoords(null);
                          setSortByDistance(false);
                        }}
                        className="h-7 px-2 rounded-xl hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Category Filter */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Event Categories</Label>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                    {EVENT_CATEGORIES.map((category) => (
                      <Button
                        key={category}
                        variant={
                          selectedCategories.includes(category)
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        className={cn(
                          "h-auto py-2 px-4 text-sm rounded-2xl transition-all duration-200 hover:scale-105",
                          selectedCategories.includes(category)
                            ? "bg-primary text-primary-foreground shadow-lg"
                            : "hover:bg-primary/10 hover:border-primary/50"
                        )}
                        onClick={() => {
                          if (selectedCategories.includes(category)) {
                            setSelectedCategories(
                              selectedCategories.filter((c) => c !== category)
                            );
                          } else {
                            setSelectedCategories([
                              ...selectedCategories,
                              category,
                            ]);
                          }
                        }}
                      >
                        {category}
                      </Button>
                    ))}
                  </div>
                  {selectedCategories.length > 0 && (
                    <div className="text-sm text-primary bg-primary/10 p-3 rounded-xl">
                      🎯 {selectedCategories.length} category(s) selected
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  {/* Date Range */}
                  <div className="flex gap-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "justify-start text-left font-medium rounded-2xl py-3 px-4 border-2 hover:border-primary/50 transition-all duration-200",
                            !dateRange?.from && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-3 h-5 w-5" />
                          {dateRange?.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, y")}
                              </>
                            ) : (
                              format(dateRange.from, "MMM dd, y")
                            )
                          ) : (
                            <span>📅 Pick dates</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-2xl" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange?.from}
                          selected={dateRange}
                          onSelect={setDateRange}
                          numberOfMonths={2}
                          className="rounded-2xl"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Past Events Toggle */}
                  <div className="flex items-center space-x-3 p-4 bg-muted/50 rounded-2xl">
                    <Switch
                      id="past-events"
                      checked={showPastEvents}
                      onCheckedChange={setShowPastEvents}
                      className="data-[state=checked]:bg-primary"
                    />
                    <Label htmlFor="past-events" className="font-medium cursor-pointer">
                      🕰️ Include past events
                    </Label>
                  </div>
                </div>

                {/* Event Type Filter */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Event Type</Label>
                  <RadioGroup
                    value={eventTypeFilter}
                    onValueChange={(value) => setEventTypeFilter(value as "all" | "in-person" | "live")}
                    className="flex flex-col sm:flex-row gap-3 sm:gap-6"
                  >
                    <div className="flex items-center space-x-3 p-4 bg-muted/50 rounded-2xl cursor-pointer hover:bg-primary/5 transition-colors">
                      <RadioGroupItem value="all" id="all" className="text-primary" />
                      <Label htmlFor="all" className="font-medium cursor-pointer">
                        🎭 All Events
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-4 bg-muted/50 rounded-2xl cursor-pointer hover:bg-primary/5 transition-colors">
                      <RadioGroupItem value="in-person" id="in-person" className="text-primary" />
                      <Label htmlFor="in-person" className="font-medium cursor-pointer">
                        📍 In-Person
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-4 bg-muted/50 rounded-2xl cursor-pointer hover:bg-primary/5 transition-colors">
                      <RadioGroupItem value="live" id="live" className="text-primary" />
                      <Label htmlFor="live" className="font-medium cursor-pointer">
                        🎥 Live Events
                      </Label>
                    </div>
                  </RadioGroup>
                  {eventTypeFilter !== "all" && (
                    <div className="text-sm text-primary bg-primary/10 p-3 rounded-xl">
                      {eventTypeFilter === "live" ? "🎥 Showing live events only" : "📍 Showing in-person events only"}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {filteredEvents?.length === 0 ? (
        <div className="text-center py-12 sm:py-16 space-y-4">
          <div className="text-6xl">🎭</div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">No events found</h3>
            <p className="text-muted-foreground">Try adjusting your filters or check back later for new events!</p>
          </div>
        </div>
      ) : viewMode === "map" ? (
        <MapView events={filteredEvents || []} className="mb-6" />
      ) : viewMode === "calendar" ? (
        <MonthlyCalendarView events={filteredEvents || []} />
      ) : (
        <>
          <div className="grid gap-3 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents?.map((event: (DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom) & { distance?: number }, index) => {
              const title =
                event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
              const description = event.content;
              const startTime = (event.kind === 30311 || event.kind === 30312 || event.kind === 30313)
                ? event.tags.find((tag) => tag[0] === "starts")?.[1]
                : event.tags.find((tag) => tag[0] === "start")?.[1];
              const location = event.tags.find(
                (tag) => tag[0] === "location"
              )?.[1];
              const imageUrl = event.tags.find((tag) => tag[0] === "image")?.[1];
              const eventIdentifier = createEventIdentifier(event);
              
              // Extract pricing information
              const price = event.tags.find((tag) => tag[0] === "price")?.[1];
              const lightningAddress = event.tags.find((tag) => tag[0] === "lud16")?.[1];
              const isPaidEvent = price && lightningAddress;
              
              // Calculate attendee count from RSVPs
              const eventAddress = event.tags.find((tag) => tag[0] === "d")?.[1] 
                ? `${event.kind}:${event.pubkey}:${event.tags.find((tag) => tag[0] === "d")?.[1]}` 
                : null;
              const eventId = event.id;
              
              // Get RSVPs for this event from allEventsData
              const rsvpEvents = (allEventsData || [])
                .filter((e): e is EventRSVP => e.kind === 31925)
                .filter((e) => {
                  // Match by event ID (e tag) for current version
                  const hasEventId = e.tags.some((tag) => tag[0] === "e" && tag[1] === eventId);
                  // Match by address coordinate (a tag) for all versions of replaceable events
                  const hasAddress = eventAddress && e.tags.some((tag) => tag[0] === "a" && tag[1] === eventAddress);
                  return hasEventId || hasAddress;
                });
              
              // Get most recent RSVP for each user
              const latestRSVPs = rsvpEvents.reduce((acc, curr) => {
                const existingRSVP = acc.find((e) => e.pubkey === curr.pubkey);
                if (!existingRSVP || curr.created_at > existingRSVP.created_at) {
                  const filtered = acc.filter((e) => e.pubkey !== curr.pubkey);
                  return [...filtered, curr];
                }
                return acc;
              }, [] as EventRSVP[]);
              
              // Count accepted RSVPs
              const acceptedRSVPs = latestRSVPs.filter(
                (e) => e.tags.find((tag) => tag[0] === "status")?.[1] === "accepted"
              );
              const attendeeCount = acceptedRSVPs.length;
              
              // Check if this is a live event
              const live = isLiveEvent(event);
              const inPerson = isInPersonEvent(event);
              const streamingUrl = getStreamingUrl(event);
              const liveStatus = event.kind === 30311 ? getLiveEventStatus(event as LiveEvent) : null;
              
              // Get platform icon for live events
              const platformIcon = isLiveEventType(event) ? getPlatformIcon(event) : null;

              // Add ref to last element for infinite scroll
              const isLastElement = index === filteredEvents.length - 1;

              return (
                <div 
                  key={event.id}
                  ref={isLastElement ? lastEventElementRef : undefined}
                >
                  <Link to={`/event/${eventIdentifier}`}>
                    <Card className="h-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 overflow-hidden rounded-none sm:rounded-3xl border-2 border-transparent hover:border-primary/20 group">
                    <div className="aspect-video w-full overflow-hidden relative">
                      <img
                        src={imageUrl || "/default-calendar.png"}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Live Event Badge */}
                      {live && (
                        <div className="absolute top-3 left-3 z-10">
                          <Badge className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold shadow-lg",
                            liveStatus === 'live' 
                              ? "bg-red-500 text-white animate-pulse" 
                              : "bg-blue-500 text-white"
                          )}>
                            {liveStatus === 'live' ? (
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
                        </div>
                      )}
                      
                      {/* In-Person Badge */}
                      {inPerson && !live && (
                        <div className="absolute top-3 left-3 z-10">
                          <Badge className="px-3 py-1 rounded-full text-xs font-semibold shadow-lg bg-green-500 text-white">
                            📍 In-Person
                          </Badge>
                        </div>
                      )}
                    </div>
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-lg sm:text-xl line-clamp-2 group-hover:text-primary transition-colors duration-200 flex items-center gap-2">
                        {platformIcon && (
                          <span 
                            className="text-xl flex-shrink-0" 
                            title={`Live on ${platformIcon.name}`}
                          >
                            {platformIcon.icon}
                          </span>
                        )}
                        <span className="flex-1">{title}</span>
                      </CardTitle>
                      {startTime && (
                        <CardDescription className="text-sm font-medium">
                          <TimezoneDisplay event={event as DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom} showLocalTime={false} />
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                      
                      {/* Additional event details */}
                      <div className="mt-3 space-y-2">
                        {/* Pricing information */}
                        {isPaidEvent ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-2 rounded-xl border border-amber-200 dark:border-amber-800">
                            <span className="text-amber-600 dark:text-amber-400">🎟️</span>
                            <span className="font-medium text-amber-800 dark:text-amber-200">
                              {formatAmount(parseInt(price))}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-green-50 dark:bg-green-950/20 p-2 rounded-xl border border-green-200 dark:border-green-800">
                            <span className="text-green-600 dark:text-green-400">🆓</span>
                            <span className="font-medium text-green-800 dark:text-green-200">
                              Free Event
                            </span>
                          </div>
                        )}
                        
                        {/* Attendee count (show for any count, but with different styling) */}
                        {attendeeCount > 0 && (
                          <div className={`flex items-center gap-2 text-sm text-muted-foreground p-2 rounded-xl border ${
                            attendeeCount > 5 
                              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
                              : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
                          }`}>
                            <span className={`${attendeeCount > 5 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>👥</span>
                            <span className={`font-medium ${attendeeCount > 5 ? 'text-green-800 dark:text-green-200' : 'text-blue-800 dark:text-blue-200'}`}>
                              {attendeeCount} {attendeeCount === 1 ? 'person' : 'people'} going
                            </span>
                          </div>
                        )}
                        
                        {/* Live stream or location */}
                        {streamingUrl ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-2 rounded-xl border border-blue-200 dark:border-blue-800">
                            <span className="text-blue-600 dark:text-blue-400">🎥</span>
                            <span className="font-medium text-blue-800 dark:text-blue-200">Live Stream</span>
                          </div>
                        ) : location && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-xl">
                            <span className="text-primary">📍</span>
                            <span className="font-medium">{location}</span>
                            {sortByDistance && event.distance !== undefined && (
                              <Badge variant="secondary" className="ml-auto">
                                {formatDistance(event.distance)} away
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                    </Card>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Load more button */}
          {canLoadMore && (
            <div className="flex justify-center py-8">
              <Button
                onClick={loadMoreEvents}
                variant="outline"
                className="px-8 py-3 rounded-2xl border-2 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 font-medium"
              >
                🎉 Load More Events ({sortedEvents!.length - displayedEventCount} remaining)
              </Button>
            </div>
          )}

          {/* Debug info - show in grid view */}
          {viewMode === "grid" && (
            <div className="flex justify-center py-4">
              <div className="text-xs text-muted-foreground space-y-2 text-center">
                <div>Debug Info:</div>
                <div>Total events loaded: {calendarEvents?.length || 0}</div>
                <div>After filtering: {sortedEvents?.length || 0}</div>
                <div>Currently displayed: {filteredEvents?.length || 0}</div>
                <div>Can load more: {String(canLoadMore)}</div>
                {canLoadMore && (
                  <Button
                    onClick={loadMoreEvents}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    🔧 Debug: Load More
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
