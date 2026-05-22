import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useNostr } from "@/hooks/useNostr";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarDays, Loader2, Plus, Check, Minus, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export interface SubmitToGroupCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarCoordinate: string;
  rejectedCoordinates?: string[];
}

export function SubmitToGroupCalendarDialog({ open, onOpenChange, calendarCoordinate, rejectedCoordinates = [] }: SubmitToGroupCalendarDialogProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch all events by the current user
  const { data: userEvents = [], isLoading: isLoadingEvents } = useQuery({
    queryKey: ['userEvents', user?.pubkey],
    enabled: !!nostr && !!user?.pubkey && open,
    queryFn: async () => {
      const events = await nostr.query([
        {
          kinds: [31922, 31923],
          authors: [user!.pubkey],
          limit: 50
        }
      ]);

      // Deduplicate and parse
      const uniqueEventsMap = new Map();
      events.forEach((e: any) => uniqueEventsMap.set(e.id, e));
      const deduplicatedEvents = Array.from(uniqueEventsMap.values());

      return deduplicatedEvents.sort((a: any, b: any) => b.created_at - a.created_at);
    }
  });

  const handleToggleEvent = async (event: any, isAlreadySubmitted: boolean) => {
    if (!nostr || !user) return;
    setProcessingId(event.id);

    try {
      const existingTags = [...event.tags];

      if (isAlreadySubmitted) {
        // Remove the 'a' tag mapping to the calendar
        const newTags = existingTags.filter((tag: string[]) => {
          if (tag[0] === 'a') return tag[1] !== calendarCoordinate;
          return true;
        });

        await new Promise((resolve, reject) => {
          createEvent({
            kind: event.kind,
            content: event.content,
            tags: newTags,
          }, { onSuccess: resolve, onError: reject });
        });

        toast.info("Event removed from group calendar.");

      } else {
        // Add the 'a' tag mapping to the calendar
        existingTags.push(['a', calendarCoordinate]);

        await new Promise((resolve, reject) => {
          createEvent({
            kind: event.kind,
            content: event.content,
            tags: existingTags,
          }, { onSuccess: resolve, onError: reject });
        });

        toast.success("Event submitted to group calendar!");
      }

      // Invalidate queries so the UI updates
      queryClient.invalidateQueries({ queryKey: ['calendarEvents', calendarCoordinate] });
      queryClient.invalidateQueries({ queryKey: ['userEvents', user.pubkey] });

    } catch (error: any) {
      console.error("Failed to update event:", error);
      toast.error(error.message || "Failed to update event");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Submit Event to Calendar</DialogTitle>
          <DialogDescription>
            Select one of your existing events to embed it into this group calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-3">
          {isLoadingEvents ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : userEvents.length > 0 ? (
            userEvents.map((event: any) => {
              const title = event.tags.find((t: string[]) => t[0] === 'title')?.[1] || 'Untitled Event';
              const isProcessing = processingId === event.id;

              // Calculate its coordinate
              const isReplaceable = event.kind >= 30000 && event.kind < 40000;
              const dTag = event.tags.find((t: string[]) => t[0] === 'd')?.[1];
              const activeEventCoordinate = isReplaceable && dTag ? `${event.kind}:${event.pubkey}:${dTag}` : event.id;

              // Check if it already has the 'a' tag for this calendar
              const isAlreadySubmitted = event.tags.some((t: string[]) => t[0] === 'a' && t[1] === calendarCoordinate);

              // Check if the calendar owner has blacklisted it
              const isDenied = rejectedCoordinates.includes(activeEventCoordinate) || rejectedCoordinates.includes(event.id);

              return (
                <div
                  key={event.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${isDenied ? 'bg-destructive/5 border-destructive/20 opacity-80 cursor-not-allowed'
                      : isAlreadySubmitted ? 'bg-primary/5 border-primary/20'
                        : 'bg-card hover:bg-muted/50'
                    }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <div className={`p-2 rounded-full shrink-0 ${isDenied ? 'bg-destructive/10 text-destructive'
                        : isAlreadySubmitted ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <div className="truncate pr-4 border-r">
                      <p className={`font-medium truncate ${isDenied && 'text-muted-foreground line-through'}`}>{title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {isDenied ? 'Denied by Organizer' : isAlreadySubmitted ? 'Submitted' : 'Not submitted'}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant={isDenied ? "ghost" : isAlreadySubmitted ? "outline" : "secondary"}
                    size="sm"
                    className={`ml-3 shrink-0 ${isDenied ? 'text-destructive font-semibold cursor-not-allowed' : isAlreadySubmitted ? 'text-destructive hover:text-destructive' : ''}`}
                    onClick={() => {
                      if (!isDenied) handleToggleEvent(event, isAlreadySubmitted);
                    }}
                    disabled={isProcessing || isDenied}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isDenied ? (
                      <>
                        <ShieldAlert className="h-4 w-4 mr-1" />
                        Denied
                      </>
                    ) : isAlreadySubmitted ? (
                      <>
                        <Minus className="h-4 w-4 mr-1" />
                        Remove
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-1" />
                        Submit
                      </>
                    )}
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg bg-muted/20">
              <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground mb-4">You haven't created any events yet.</p>
              <Button asChild variant="outline">
                <Link to="/create" onClick={() => onOpenChange(false)}>
                  Create an Event
                </Link>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
