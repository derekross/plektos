import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createEventIdentifier } from "@/lib/nip19Utils";
import { getEventTimezone, formatEventTime } from "@/lib/eventTimezone";
import { useCalendarEvents } from "@/lib/eventUtils";
import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting, InteractiveRoom } from "@/lib/eventTypes";
import { isLiveEvent } from "@/lib/liveEventUtils";

interface MonthlyCalendarViewProps {
  events?: (DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom)[]; // Make optional since we can load our own
  className?: string;
}

interface CalendarEvent {
  event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom;
  title: string;
  startTime?: string;
  isTimeEvent: boolean;
  isLiveEvent: boolean;
}

export function MonthlyCalendarView({ events: passedEvents, className }: MonthlyCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [requestedMonths, setRequestedMonths] = useState(new Set<string>());

  // Only use calendar-optimized data loading if no events are passed
  const { data: calendarEvents, isLoading } = useCalendarEvents(currentDate);

  // Prioritize passed events, fallback to loaded calendar events (filtering out RSVPs)
  const events = passedEvents ?? (calendarEvents?.filter((event) =>
    event.kind === 31922 || event.kind === 31923 || event.kind === 30311 || event.kind === 30312 || event.kind === 30313
  ) as (DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom)[] ?? []);

  // Check if current month has events or if we should show a load more option
  const currentMonthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  const hasEventsInCurrentMonth = events.some(event => {
    const startTime = (event.kind === 30311 || event.kind === 30312 || event.kind === 30313)
      ? event.tags.find((tag) => tag[0] === "starts")?.[1]
      : event.tags.find((tag) => tag[0] === "start")?.[1];
    if (!startTime) return false;

    let eventDate: Date;
    if (event.kind === 31922) {
      if (startTime.match(/^\d{10}$/)) {
        eventDate = new Date(parseInt(startTime) * 1000);
      } else if (startTime.match(/^\d{13}$/)) {
        eventDate = new Date(parseInt(startTime));
      } else {
        const [year, month, day] = startTime.split('-').map(Number);
        eventDate = new Date(year, month - 1, day);
      }
    } else {
      let timestamp = parseInt(startTime);

      // Handle both seconds and milliseconds timestamps
      if (timestamp < 10000000000) {
        // Likely in seconds, convert to milliseconds
        timestamp = timestamp * 1000;
      }

      eventDate = new Date(timestamp);
    }

    return eventDate.getFullYear() === currentDate.getFullYear() &&
      eventDate.getMonth() === currentDate.getMonth();
  });

  // Get the first day of the current month
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  // Get the first day of the calendar grid (might be from previous month)
  const firstDayOfCalendar = new Date(firstDayOfMonth);
  firstDayOfCalendar.setDate(firstDayOfCalendar.getDate() - firstDayOfMonth.getDay());

  // Get the last day of the calendar grid (might be from next month)
  const lastDayOfCalendar = new Date(lastDayOfMonth);
  lastDayOfCalendar.setDate(lastDayOfCalendar.getDate() + (6 - lastDayOfMonth.getDay()));

  // Generate calendar days
  const calendarDays: Date[] = [];
  const currentDay = new Date(firstDayOfCalendar);
  while (currentDay <= lastDayOfCalendar) {
    calendarDays.push(new Date(currentDay));
    currentDay.setDate(currentDay.getDate() + 1);
  }

  const getLocalDateKey = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Group events by date
  const eventsByDate = new Map<string, CalendarEvent[]>();

  events.forEach((event) => {
    const startTime = (event.kind === 30311 || event.kind === 30312 || event.kind === 30313)
      ? event.tags.find((tag) => tag[0] === "starts")?.[1]
      : event.tags.find((tag) => tag[0] === "start")?.[1];
    if (!startTime) return;

    const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
    const eventTimezone = getEventTimezone(event);

    let eventDate: Date;
    let formattedTime: string | undefined;

    if (event.kind === 31922) {
      // Date-based event
      if (startTime.match(/^\d{10}$/)) {
        eventDate = new Date(parseInt(startTime) * 1000);
      } else if (startTime.match(/^\d{13}$/)) {
        eventDate = new Date(parseInt(startTime));
      } else {
        // YYYY-MM-DD format
        const [year, month, day] = startTime.split('-').map(Number);
        eventDate = new Date(year, month - 1, day);
      }
    } else {
      // Time-based event, live event, or room meeting
      let timestamp = parseInt(startTime);

      // Handle both seconds and milliseconds timestamps
      if (timestamp < 10000000000) {
        // Likely in seconds, convert to milliseconds
        timestamp = timestamp * 1000;
      }

      eventDate = new Date(timestamp);

      // Format the time in the event's timezone
      formattedTime = formatEventTime(timestamp, eventTimezone);
    }

    if (isNaN(eventDate.getTime())) return;

    // Create date key (YYYY-MM-DD) natively in the browser's local timezone
    const dateKey = getLocalDateKey(eventDate);

    if (!eventsByDate.has(dateKey)) {
      eventsByDate.set(dateKey, []);
    }

    eventsByDate.get(dateKey)!.push({
      event,
      title,
      startTime: formattedTime,
      isTimeEvent: event.kind === 31923 || event.kind === 30311,
      isLiveEvent: isLiveEvent(event),
    });
  });

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Show loading spinner only if we're loading calendar data and no events were passed
  if (!passedEvents && isLoading) {
    return (
      <Card className={cn("rounded-none sm:rounded-lg", className)}>
        <CardContent className="p-3 sm:p-6 flex items-center justify-center min-h-[400px]">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("rounded-none sm:rounded-lg", className)}>
      <CardContent className="p-3 sm:p-6">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-semibold">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              className="text-xs"
            >
              Today
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('prev')}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('next')}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {/* Day Headers */}
          {dayNames.map((day) => (
            <div
              key={day}
              className="p-2 text-center text-xs sm:text-sm font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {calendarDays.map((date, index) => {
            const dateKey = getLocalDateKey(date);
            const dayEvents = eventsByDate.get(dateKey) || [];
            const isCurrentMonthDay = isCurrentMonth(date);
            const isTodayDate = isToday(date);

            return (
              <div
                key={index}
                className={cn(
                  "min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 border rounded-md",
                  !isCurrentMonthDay && "bg-muted/30 text-muted-foreground",
                  isTodayDate && "bg-primary/10 border-primary/30"
                )}
              >
                {/* Date Number */}
                <div className={cn(
                  "text-xs sm:text-sm font-medium mb-1",
                  isTodayDate && "text-primary font-bold"
                )}>
                  {date.getDate()}
                </div>

                {/* Events */}
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((calendarEvent, eventIndex) => (
                    <Link
                      key={eventIndex}
                      to={`/event/${createEventIdentifier(calendarEvent.event)}`}
                      className="block"
                    >
                      <div className={cn(
                        "text-xs p-1 rounded truncate transition-colors",
                        calendarEvent.isLiveEvent
                          ? "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200"
                          : calendarEvent.isTimeEvent
                            ? "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200"
                            : "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200"
                      )}>
                        {calendarEvent.startTime && (
                          <span className="font-medium">
                            {calendarEvent.startTime}{" "}
                          </span>
                        )}
                        <span className="truncate">
                          {calendarEvent.title}
                        </span>
                      </div>
                    </Link>
                  ))}

                  {/* Show "more" indicator if there are additional events */}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-muted-foreground px-1">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend and Load More */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-100 dark:bg-red-900 rounded"></div>
              <span>Live events</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-100 dark:bg-blue-900 rounded"></div>
              <span>Time-based events</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-100 dark:bg-green-900 rounded"></div>
              <span>All-day events</span>
            </div>
          </div>

          {/* Show load more hint if no events in current month and we haven't requested more */}
          {!hasEventsInCurrentMonth && !requestedMonths.has(currentMonthKey) && !passedEvents && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRequestedMonths(prev => new Set(prev).add(currentMonthKey));
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Load more events for this month
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
