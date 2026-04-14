import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { Share2, MapPin, Calendar } from "lucide-react";
import { toast } from "sonner";
import { createEventUrl, createEventIdentifier, isReplaceableEvent } from "@/lib/nip19Utils";
import { sanitizeUrl } from "@/lib/utils";
import { TimezoneDisplay } from "@/components/TimezoneDisplay";
import { getPlatformIcon, isLiveEventType } from "@/lib/platformIcons";
import {
  getEventTimezone,
  formatEventDateTime,
  formatEventTime,
  getTimezoneAbbreviation,
} from "@/lib/eventTimezone";
import type {
  DateBasedEvent,
  TimeBasedEvent,
  LiveEvent,
  RoomMeeting,
  InteractiveRoom,
} from "@/lib/eventTypes";

type ShareableEvent = DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom;

interface ShareEventDialogProps {
  event: ShareableEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generateShareMessage(event: ShareableEvent): string {
  const title =
    event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled Event";
  const location = event.tags.find((tag) => tag[0] === "location")?.[1];
  const startTime = event.tags.find((tag) => tag[0] === "start")?.[1];

  let shareMessage = `Join me at ${title}!\n\n`;

  if (startTime) {
    const eventTimezone = getEventTimezone(event);
    const timezoneAbbr = getTimezoneAbbreviation(
      eventTimezone,
      new Date(parseInt(startTime) * 1000).getTime()
    );

    if (event.kind === 31922) {
      // For date-only events, format in event's timezone
      let date;
      if (startTime.match(/^\d{10}$/)) {
        date = new Date(parseInt(startTime) * 1000);
      } else if (startTime.match(/^\d{13}$/)) {
        date = new Date(parseInt(startTime));
      } else {
        const [year, month, day] = startTime.split("-").map(Number);
        date = new Date(year, month - 1, day);
      }

      shareMessage += `${formatEventDateTime(
        date.getTime(),
        eventTimezone
      )}${timezoneAbbr}\n`;
    } else {
      // For time-based events, format in event's timezone
      const startDate = new Date(parseInt(startTime) * 1000);
      const endTime = event.tags.find((tag) => tag[0] === "end")?.[1];

      if (endTime) {
        const endDate = new Date(parseInt(endTime) * 1000);
        const startDateTime = formatEventDateTime(
          startDate.getTime(),
          eventTimezone,
          {
            hour: "numeric",
            minute: "numeric",
          }
        );
        const endTimeOnly = formatEventTime(endDate.getTime(), eventTimezone);
        shareMessage += `${startDateTime} - ${endTimeOnly}${timezoneAbbr}\n`;
      } else {
        const startDateTime = formatEventDateTime(
          startDate.getTime(),
          eventTimezone,
          {
            hour: "numeric",
            minute: "numeric",
          }
        );
        shareMessage += `${startDateTime}${timezoneAbbr}\n`;
      }
    }
  }

  if (location) {
    shareMessage += `${location}\n`;
  }

  // Add a truncated description if available
  if (event.content) {
    const truncatedContent =
      event.content.length > 150
        ? event.content.substring(0, 150) + "..."
        : event.content;
    shareMessage += `\n${truncatedContent}\n`;
  }

  // Create the event URL using the current origin
  shareMessage += `\n${createEventUrl(event)}`;

  return shareMessage;
}

export function ShareEventDialog({
  event,
  open,
  onOpenChange,
}: ShareEventDialogProps) {
  const [message, setMessage] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [imageError, setImageError] = useState(false);

  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Detect platform for keyboard hint
  const isMac = typeof navigator !== "undefined" &&
    /mac/i.test(navigator.userAgentData?.platform ?? navigator.userAgent);

  // Extract event details for preview
  const eventTitle =
    event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled Event";
  const eventImage = event.tags.find((tag) => tag[0] === "image")?.[1];
  const eventLocation = event.tags.find((tag) => tag[0] === "location")?.[1];
  const startTime =
    event.kind === 30311 || event.kind === 30312 || event.kind === 30313
      ? event.tags.find((tag) => tag[0] === "starts")?.[1]
      : event.tags.find((tag) => tag[0] === "start")?.[1];

  // Get platform icon for live events
  const platformIcon = isLiveEventType(event) ? getPlatformIcon(event) : null;

  // Initialize message and reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMessage(generateShareMessage(event));
      setImageError(false);
    }
  }, [open, event]);

  const handleShare = async () => {
    if (!user || !message.trim()) return;

    setIsSharing(true);
    try {
      // Build NIP-compliant tags referencing the original event
      const tags: string[][] = [
        ["p", event.pubkey],
      ];

      if (isReplaceableEvent(event.kind)) {
        const dTag = event.tags.find((t) => t[0] === "d")?.[1];
        if (dTag) {
          tags.push(["a", `${event.kind}:${event.pubkey}:${dTag}`]);
        }
      }
      tags.push(["e", event.id]);
      // Add q tag for quote repost (NIP-18)
      const nip19Id = createEventIdentifier(event);
      tags.push(["q", event.id, "", nip19Id]);

      await publishEvent({
        kind: 1,
        content: message,
        tags,
      });

      toast.success("Event shared successfully!");
      onOpenChange(false);
    } catch {
      toast.error("Failed to share event");
    } finally {
      setIsSharing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !isSharing) {
      e.preventDefault();
      handleShare();
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share Event
          </DialogTitle>
          <DialogDescription>
            Share this event with your followers. You can edit the message
            before posting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event Preview Card */}
          <Card className="border-2 border-border/50 overflow-hidden">
            {sanitizeUrl(eventImage) && !imageError && (
              <div className="aspect-video w-full overflow-hidden bg-muted">
                <img
                  src={sanitizeUrl(eventImage)!}
                  alt={eventTitle}
                  className="w-full h-full object-cover"
                  onError={() => setImageError(true)}
                />
              </div>
            )}
            <CardContent className="p-3">
              <CardTitle className="text-base font-bold mb-2 flex items-center gap-2">
                {platformIcon && (
                  <span
                    className="text-lg flex-shrink-0"
                    title={`Live on ${platformIcon.name}`}
                  >
                    {platformIcon.icon}
                  </span>
                )}
                <span className="flex-1 line-clamp-1">{eventTitle}</span>
              </CardTitle>

              {startTime && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  <TimezoneDisplay
                    event={event}
                    showLocalTime={true}
                    className="text-sm"
                  />
                </div>
              )}

              {eventLocation && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="line-clamp-1">{eventLocation}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Message Editor */}
          <div className="space-y-2">
            <Label htmlFor="share-message">Your Message</Label>
            <Textarea
              id="share-message"
              placeholder="Write something about this event..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[140px] resize-none"
              disabled={isSharing}
            />
            <p className="text-xs text-muted-foreground">
              Press {isMac ? "Cmd" : "Ctrl"}+Enter to share
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSharing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            disabled={!message.trim() || isSharing}
          >
            {isSharing ? (
              <>Sharing...</>
            ) : (
              <>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
