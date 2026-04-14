import { Link } from "react-router-dom";
import { Users, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useFollowerRSVPs, type FollowerRSVPActivity } from "@/hooks/useFollowerRSVPs";
import { useAuthorsMetadata } from "@/hooks/useAuthorsMetadata";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createEventIdentifier } from "@/lib/nip19Utils";
import { TimezoneDisplay } from "@/components/TimezoneDisplay";
import { genUserName } from "@/lib/genUserName";
import { LoginArea } from "@/components/auth/LoginArea";
import { getPlatformIcon, isLiveEventType } from "@/lib/platformIcons";
import { getAvatarShape } from "@/lib/avatarShapes";
import { useMemo, useEffect, useCallback } from "react";

export function SocialFeed() {
  const { user } = useCurrentUser();
  const { 
    followerActivity, 
    isLoading, 
    error, 
    hasFollows, 
    refetch, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useFollowerRSVPs();

  // Get unique pubkeys for metadata lookup
  const uniquePubkeys = useMemo(() => {
    return Array.from(new Set(followerActivity.map(activity => activity.authorPubkey)));
  }, [followerActivity]);

  const { data: authorsMetadata = {} } = useAuthorsMetadata(uniquePubkeys);

  // Infinite scroll functionality
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
    };
  }, [handleLoadMore]);

  // Auto-refresh functionality (only refresh first page)
  useEffect(() => {
    if (!user) return; // Don't auto-refresh if not logged in

    // Set up periodic refresh every 2 minutes
    const refreshInterval = setInterval(() => {
      refetch();
    }, 2 * 60 * 1000); // 2 minutes

    // Cleanup interval on unmount
    return () => clearInterval(refreshInterval);
  }, [user, refetch]);

  // Show login prompt if not logged in
  if (!user) {
    return (
      <div className="container px-0 sm:px-4 py-2 sm:py-6 space-y-6 max-w-4xl mx-auto">
        <div className="px-3 sm:px-0">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Social Feed 💫
            </h1>
            <p className="text-base md:text-lg text-muted-foreground">
              See events your friends are attending
            </p>
          </div>
        </div>

        <Card className="rounded-none sm:rounded-2xl border-2 border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardContent className="p-6 text-center space-y-6">
            <div className="text-6xl">🔐</div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Login Required</h3>
              <p className="text-muted-foreground">
                Sign in to see events that people you follow are attending
              </p>
            </div>
            <LoginArea className="max-w-60 mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container px-0 sm:px-4 py-2 sm:py-6 space-y-3 sm:space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-3 sm:px-0">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Social Feed 💫
            </h1>
            {isLoading && followerActivity.length > 0 && (
              <Loader2 className="h-5 w-5 animate-spin text-primary opacity-60" />
            )}
          </div>
          <p className="text-base md:text-lg text-muted-foreground">
            Events your friends are attending
          </p>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <Card className="rounded-none sm:rounded-2xl border-2 border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardContent className="p-6 flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center space-y-1">
              <p className="font-medium">Loading your social feed...</p>
              <p className="text-sm text-muted-foreground">
                Fetching RSVPs from people you follow
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <Card className="rounded-none sm:rounded-2xl border-2 border-destructive/20 bg-gradient-to-r from-destructive/5 to-destructive/10">
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-4xl">😕</div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Unable to load feed</h3>
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : "Something went wrong loading your social feed"}
              </p>
            </div>
            <Button onClick={() => refetch()} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* No Follows State */}
      {!isLoading && !error && !hasFollows && (
        <Card className="rounded-none sm:rounded-2xl border-2 border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardContent className="p-6 text-center space-y-6">
            <div className="text-6xl">👥</div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">No social feed yet</h3>
              <p className="text-muted-foreground">
                Follow some users to see events they're attending in your social feed
              </p>
            </div>
            <Button variant="outline" size="lg" className="gap-2 rounded-2xl" asChild>
              <Link to="/">
                <Users className="h-5 w-5" />
                Discover Events & People
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty Feed State */}
      {!isLoading && !error && hasFollows && followerActivity.length === 0 && (
        <Card className="rounded-none sm:rounded-2xl border-2 border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardContent className="p-6 text-center space-y-6">
            <div className="text-6xl">🎭</div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">No recent activity</h3>
              <p className="text-muted-foreground">
                People you follow haven't RSVP'd to any events recently. Check back later!
              </p>
            </div>
            <Button variant="outline" size="lg" className="gap-2 rounded-2xl" asChild>
              <Link to="/">
                <Calendar className="h-5 w-5" />
                Browse All Events
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Feed Content */}
      {!isLoading && !error && followerActivity.length > 0 && (
        <>
          <div className="space-y-4 sm:space-y-6">
            {followerActivity.map((activity) => (
              <SocialFeedItem 
                key={activity.rsvp.id}
                activity={activity}
                authorMetadata={authorsMetadata[activity.authorPubkey]}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel and loading state */}
          {hasNextPage ? (
            <>
              <div id="scroll-sentinel" className="h-4" />
              {isFetchingNextPage && (
                <Card className="rounded-none sm:rounded-2xl border-2 border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5">
                  <CardContent className="p-6 flex flex-col items-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading more activity...</p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            /* End Message */
            <Card className="rounded-none sm:rounded-2xl border border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  🎉 You're all caught up! This shows the most recent RSVPs from people you follow.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

interface SocialFeedItemProps {
  activity: FollowerRSVPActivity;
  authorMetadata?: { name?: string; display_name?: string; picture?: string };
}

function SocialFeedItem({ activity, authorMetadata }: SocialFeedItemProps) {
  const authorName = authorMetadata?.name || 
                    authorMetadata?.display_name || 
                    genUserName(activity.authorPubkey);
  const authorImage = authorMetadata?.picture;
  const shape = getAvatarShape(authorMetadata);
  
  const eventTitle = activity.event.tags.find(tag => tag[0] === "title")?.[1] || "Untitled Event";
  const eventDescription = activity.event.content;
  const eventImage = activity.event.tags.find(tag => tag[0] === "image")?.[1];
  const eventLocation = activity.event.tags.find(tag => tag[0] === "location")?.[1];
  const eventIdentifier = createEventIdentifier(activity.event);
  
  // Get platform icon for live events
  const platformIcon = isLiveEventType(activity.event) ? getPlatformIcon(activity.event) : null;
  
  // Get start time for display
  const startTime = (activity.event.kind === 30311 || activity.event.kind === 30312 || activity.event.kind === 30313)
    ? activity.event.tags.find(tag => tag[0] === "starts")?.[1]
    : activity.event.tags.find(tag => tag[0] === "start")?.[1];

  return (
    <Card className="rounded-none sm:rounded-2xl border-2 border-transparent hover:border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
      <CardHeader className="p-4 sm:p-5 pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 sm:h-12 sm:w-12" shape={shape}>
            <AvatarImage src={authorImage} alt={authorName} />
            <AvatarFallback className="text-sm font-medium">
              {authorName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm sm:text-base">{authorName}</span>
              <span className="text-xs sm:text-sm text-muted-foreground">is going to</span>
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                Attending
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              RSVP'd {new Date(activity.rsvp.created_at * 1000).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
              })}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-0">
        <Link to={`/event/${eventIdentifier}`} className="block group">
          <Card className="border-2 border-border/50 group-hover:border-primary/30 transition-all duration-200 overflow-hidden">
            {eventImage && (
              <div className="aspect-video sm:aspect-[2/1] w-full overflow-hidden">
                <img 
                  src={eventImage} 
                  alt={eventTitle}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            )}
            <div className="p-3 sm:p-4">
              <CardTitle className="text-base sm:text-lg font-bold group-hover:text-primary transition-colors mb-2 flex items-center gap-2">
                {platformIcon && (
                  <span 
                    className="text-lg flex-shrink-0" 
                    title={`Live on ${platformIcon.name}`}
                  >
                    {platformIcon.icon}
                  </span>
                )}
                <span className="flex-1">{eventTitle}</span>
              </CardTitle>
              
              {startTime && (
                <div className="mb-3">
                  <TimezoneDisplay 
                    event={activity.event} 
                    showLocalTime={true}
                    className="text-sm"
                  />
                </div>
              )}
              
              {eventDescription && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {eventDescription}
                </p>
              )}
              
              {eventLocation && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-xl">
                  <span className="text-primary">📍</span>
                  <span className="font-medium">{eventLocation}</span>
                </div>
              )}
              
              {activity.rsvp.content && (
                <div className="mt-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{authorName}'s note:</span> "{activity.rsvp.content}"
                  </p>
                </div>
              )}
            </div>
          </Card>
        </Link>
      </CardContent>
    </Card>
  );
}