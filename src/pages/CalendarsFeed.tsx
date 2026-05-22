import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { CalendarDays, Search, X, Loader2, Compass, Tag, MapPin, Sparkles } from "lucide-react";
import { useAllCalendars } from "@/lib/calendarUtils";
import { useAuthorsMetadata } from "@/hooks/useAuthorsMetadata";
import { genUserName } from "@/lib/genUserName";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function CalendarsFeed() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: calendars = [], isLoading, error, refetch } = useAllCalendars();

  // Get unique pubkeys for metadata lookup
  const uniquePubkeys = useMemo(() => {
    return Array.from(new Set(calendars.map((cal) => cal.pubkey)));
  }, [calendars]);

  const { data: authorsMetadata = {} } = useAuthorsMetadata(uniquePubkeys);

  // Combine calendars with creator metadata
  const calendarsWithMetadata = useMemo(() => {
    return calendars.map((cal) => {
      const meta = authorsMetadata[cal.pubkey];
      const creatorName =
        meta?.name || meta?.display_name || genUserName(cal.pubkey);
      const creatorPicture = meta?.picture;

      // Safe npub encoding
      let npub = "";
      try {
        npub = nip19.npubEncode(cal.pubkey);
      } catch (err) {
        console.error("Failed to encode pubkey to npub:", err);
      }

      return {
        ...cal,
        creatorName,
        creatorPicture,
        npub,
      };
    });
  }, [calendars, authorsMetadata]);

  // Filter calendars by search query
  const filteredCalendars = useMemo(() => {
    if (!searchQuery.trim()) return calendarsWithMetadata;
    const query = searchQuery.toLowerCase();
    return calendarsWithMetadata.filter((cal) => {
      return (
        cal.title.toLowerCase().includes(query) ||
        cal.description.toLowerCase().includes(query) ||
        cal.creatorName.toLowerCase().includes(query) ||
        (cal.hashtags &&
          cal.hashtags.some((tag) => tag.toLowerCase().includes(query))) ||
        (cal.locations &&
          cal.locations.some((loc) => loc.toLowerCase().includes(query)))
      );
    });
  }, [calendarsWithMetadata, searchQuery]);

  return (
    <div className="container px-0 sm:px-4 py-2 sm:py-6 space-y-6 max-w-6xl mx-auto">
      {/* Header section */}
      <div className="px-3 sm:px-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Community Calendars 📅
            </h1>
            {isLoading && calendars.length > 0 && (
              <Loader2 className="h-5 w-5 animate-spin text-primary opacity-60" />
            )}
          </div>
          <p className="text-base md:text-lg text-muted-foreground">
            Discover custom calendars created by the community for meetups, bar events, and more.
          </p>
        </div>

        <Button asChild className="rounded-2xl gap-2 self-start md:self-auto shadow-md hover:shadow-lg transition-all duration-300">
          <Link to="/create-calendar">
            <Sparkles className="h-5 w-5 animate-pulse-slow" />
            Create Calendar
          </Link>
        </Button>
      </div>

      {/* Search Bar */}
      <div className="px-3 sm:px-0">
        <div className="relative flex items-center max-w-md">
          <Search className="absolute left-3.5 h-5 w-5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search calendars by name, description, creator..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-12 rounded-2xl border-2 border-border focus-visible:ring-primary focus-visible:border-primary transition-all duration-200"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 h-8 w-8 p-0 rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && calendars.length === 0 && (
        <Card className="rounded-none sm:rounded-2xl border-2 border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardContent className="p-12 flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center space-y-1">
              <p className="font-medium text-lg">Loading community calendars...</p>
              <p className="text-sm text-muted-foreground">
                Connecting to relays and fetching group calendars
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <Card className="rounded-none sm:rounded-2xl border-2 border-destructive/20 bg-gradient-to-r from-destructive/5 to-destructive/10">
          <CardContent className="p-8 text-center space-y-4">
            <div className="text-4xl">😕</div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Unable to load calendars</h3>
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : "Something went wrong loading community calendars"}
              </p>
            </div>
            <Button onClick={() => refetch()} variant="outline" className="rounded-xl">
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredCalendars.length === 0 && (
        <Card className="rounded-none sm:rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/5">
          <CardContent className="p-12 text-center space-y-6">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Compass className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2 max-w-sm mx-auto">
              <h3 className="text-xl font-semibold">No calendars found</h3>
              <p className="text-muted-foreground">
                {searchQuery
                  ? `No calendars matched the search term "${searchQuery}". Try a different keyword.`
                  : "No community calendars have been published to the relays yet. Be the first to create one!"}
              </p>
            </div>
            {searchQuery ? (
              <Button onClick={() => setSearchQuery("")} variant="outline" className="rounded-xl">
                Clear Search
              </Button>
            ) : (
              <Button asChild className="rounded-xl">
                <Link to="/create-calendar">Create a Calendar</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid Content */}
      {!isLoading && !error && filteredCalendars.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr px-3 sm:px-0">
          {filteredCalendars.map((cal) => (
            <div
              key={cal.id}
              className="flex flex-col h-full rounded-3xl border-2 border-transparent hover:border-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 bg-card overflow-hidden group cursor-pointer"
              onClick={() => navigate(`/calendar/${cal.pubkey}:${cal.d}`)}
            >
              {/* Image banner */}
              <div className="aspect-[2/1] w-full overflow-hidden bg-muted relative">
                <img
                  src={cal.image || "/default-calendar.png"}
                  alt={cal.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    // fallback if image fails to load
                    e.currentTarget.src = "/default-calendar.png";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />
                
                {/* Event count badge overlaid */}
                <div className="absolute bottom-3 right-3">
                  <Badge className="bg-background/90 backdrop-blur text-foreground border-border/50 hover:bg-background/90 text-xs font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-sm">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" />
                    <span>
                      {cal.events.length} {cal.events.length === 1 ? "Event" : "Events"}
                    </span>
                  </Badge>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold group-hover:text-primary transition-colors duration-200 line-clamp-1">
                    {cal.title}
                  </h3>
                  {cal.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                      {cal.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground/60 italic">
                      No description provided.
                    </p>
                  )}
                </div>

                {/* Tags & Filters (Hashtags and Locations) */}
                {(cal.hashtags?.length || cal.locations?.length) ? (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {cal.locations?.slice(0, 2).map((loc, idx) => (
                      <Badge
                        key={`loc-${idx}`}
                        variant="secondary"
                        className="bg-accent/50 text-accent-foreground text-[10px] font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1 max-w-[120px] truncate"
                      >
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{loc}</span>
                      </Badge>
                    ))}
                    {cal.hashtags?.slice(0, 2).map((tag, idx) => (
                      <Badge
                        key={`tag-${idx}`}
                        variant="outline"
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1 max-w-[120px] truncate border-primary/20 text-primary/80"
                      >
                        <Tag className="h-3 w-3 shrink-0" />
                        <span className="truncate">#{tag}</span>
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {/* Creator profile footer */}
                <div 
                  className="pt-4 border-t border-border/50 flex items-center justify-between mt-auto"
                  onClick={(e) => e.stopPropagation()} // Prevent card navigation
                >
                  <Link
                    to={cal.npub ? `/profile/${cal.npub}` : "#"}
                    className="flex items-center gap-2 group/creator"
                  >
                    <Avatar className="h-8 w-8 border border-border group-hover/creator:border-primary/50 transition-colors">
                      <AvatarImage src={cal.creatorPicture} alt={cal.creatorName} />
                      <AvatarFallback className="text-[10px] font-bold">
                        {cal.creatorName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">Created by</span>
                      <span className="text-xs font-semibold group-hover/creator:text-primary transition-colors line-clamp-1 max-w-[140px]">
                        {cal.creatorName}
                      </span>
                    </div>
                  </Link>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-xl text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/5 transition-colors gap-1"
                    onClick={() => navigate(`/calendar/${cal.pubkey}:${cal.d}`)}
                  >
                    <span>View Calendar</span>
                    <span>→</span>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
