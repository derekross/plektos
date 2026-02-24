import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@/hooks/useNostr";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useUserCalendars, addEventToCalendar, removeEventFromCalendar, createCoordinate } from "@/lib/calendarUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarDays, Loader2, Plus, Check, Minus } from "lucide-react";
import { Link } from "react-router-dom";

export interface AddToGroupCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventCoordinate: string; // The NIP-19 naddr, nevent, or raw id/coord to be added
}

export function AddToGroupCalendarDialog({ open, onOpenChange, eventCoordinate }: AddToGroupCalendarDialogProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: userCalendars = [], isLoading: isLoadingCalendars } = useUserCalendars(user?.pubkey);
  const { mutate: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<Record<string, boolean>>({});

  const handleToggleCalendar = async (calendarCoordinate: string, currentlyAdded: boolean) => {
    if (!nostr || !user) return;

    setProcessingId(calendarCoordinate);

    try {
      if (currentlyAdded) {
        await removeEventFromCalendar(nostr, createEvent, calendarCoordinate, eventCoordinate);
        setLocalStatus(prev => ({ ...prev, [calendarCoordinate]: false }));
        toast.info("Event removed from calendar.");
      } else {
        await addEventToCalendar(nostr, createEvent, calendarCoordinate, eventCoordinate);
        setLocalStatus(prev => ({ ...prev, [calendarCoordinate]: true }));
        toast.success("Event added to calendar!");
      }

      // Invalidate the specific calendar query so it refreshes its event list
      queryClient.invalidateQueries({ queryKey: ['calendarEvents', calendarCoordinate] });
      queryClient.invalidateQueries({ queryKey: ['calendars'] }); // Update the calendar map

    } catch (error: any) {
      if (error.message === "Event is already in this calendar") {
        toast.info(error.message);
        setLocalStatus(prev => ({ ...prev, [calendarCoordinate]: true }));
      } else if (error.message === "Event is not in this calendar") {
        toast.info(error.message);
        setLocalStatus(prev => ({ ...prev, [calendarCoordinate]: false }));
      } else {
        console.error("Failed to modify calendar:", error);
        toast.error(error.message || "Failed to modify calendar");
      }
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl p-6 border-2 shadow-2xl overflow-hidden bg-background">
        <DialogHeader className="mb-6 space-y-3 pb-4 border-b">
          <div className="mx-auto bg-primary/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-2">
            <CalendarDays className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">Add to Group Calendar</DialogTitle>
          <DialogDescription className="text-center text-md">
            Feature this event on one of your community calendars.
          </DialogDescription>
        </DialogHeader>

        {isLoadingCalendars ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading your calendars...</p>
          </div>
        ) : userCalendars.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl border-2 border-dashed bg-muted/20">
            <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-1">No Calendars Found</h3>
            <p className="text-muted-foreground mb-4">You haven't created any group calendars yet.</p>
            <Button asChild className="w-full">
              <Link to="/create-calendar" onClick={() => onOpenChange(false)}>
                <Plus className="h-4 w-4 mr-2" />
                Create a Calendar
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {userCalendars.map((cal) => {
              const calendarCoordinate = createCoordinate(31924, cal.pubkey, cal.d);
              const isProcessing = processingId === calendarCoordinate;
              // Check local overrides first, otherwise fall back to fetched calendar states.
              const isAdded = localStatus[calendarCoordinate] ?? cal.events.includes(eventCoordinate);

              return (
                <div
                  key={cal.id}
                  className="flex items-center justify-between p-3 rounded-xl border-2 border-border/50 bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <img
                      src={cal.image || "/default-calendar.png"}
                      alt={cal.title}
                      className="h-10 w-10 rounded-lg object-cover bg-muted shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{cal.title}</p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={isAdded ? "outline" : "outline"}
                    className={`ml-3 shrink-0 rounded-full transition-all w-[90px] ${isAdded
                        ? 'bg-green-100/50 text-green-700 hover:bg-destructive hover:text-white border-transparent group'
                        : ''
                      }`}
                    disabled={isProcessing}
                    onClick={() => handleToggleCalendar(calendarCoordinate, isAdded)}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isAdded ? (
                      <span className="flex items-center">
                        <Check className="h-3.5 w-3.5 mr-1 group-hover:hidden" />
                        <Minus className="h-3.5 w-3.5 mr-1 hidden group-hover:inline" />
                        <span className="group-hover:hidden">Added</span>
                        <span className="hidden group-hover:inline">Remove</span>
                      </span>
                    ) : (
                      <><Plus className="h-3.5 w-3.5 mr-1" /> Add</>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
