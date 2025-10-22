import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin } from "lucide-react";
import { generateRecurringEventDates } from "@/lib/recurringEventUtils";
import type { RecurringEventConfig } from "@/components/RecurringEventForm";
import { cn } from "@/lib/utils";

interface RecurringEventPreviewProps {
  title: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  timezone: string;
  recurringConfig: RecurringEventConfig;
  className?: string;
}

export function RecurringEventPreview({
  title,
  description: _description,
  location,
  startDate,
  endDate,
  startTime,
  endTime,
  timezone,
  recurringConfig,
  className,
}: RecurringEventPreviewProps) {
  const eventDates = useMemo(() => {
    // Don't generate preview if required data is missing
    if (!startDate || !endDate) {
      return [];
    }

    if (!recurringConfig.enabled) {
      return [{
        startDate,
        endDate,
        startTime,
        endTime,
      }];
    }

    try {
      return generateRecurringEventDates(
        startDate,
        endDate,
        recurringConfig,
        startTime,
        endTime
      );
    } catch (error) {
      console.error('Error generating recurring event dates:', error);
      // Return the base event if there's an error
      return [{
        startDate,
        endDate,
        startTime,
        endTime,
      }];
    }
  }, [startDate, endDate, startTime, endTime, recurringConfig]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00Z");
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (eventDates.length <= 1) {
    return null;
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Event Preview ({eventDates.length} events)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          The following events will be created:
        </div>
        
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {eventDates.map((eventDate, index) => (
            <div
              key={index}
              className="p-3 border rounded-lg bg-muted/30 space-y-2"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="font-medium text-sm">
                    {title} {index > 0 && `#${index + 1}`}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatDate(eventDate.startDate)}
                    {eventDate.startDate !== eventDate.endDate && (
                      <span> - {formatDate(eventDate.endDate)}</span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  Event {index + 1}
                </Badge>
              </div>
              
              {eventDate.startTime && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTime(eventDate.startTime)}
                  {eventDate.endTime && (
                    <span> - {formatTime(eventDate.endTime)}</span>
                  )}
                  <span className="text-xs opacity-75">({timezone})</span>
                </div>
              )}
              
              {location && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {location}
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="text-xs text-muted-foreground pt-2 border-t">
          💡 Tip: You can edit individual events after creation if needed
        </div>
      </CardContent>
    </Card>
  );
}
