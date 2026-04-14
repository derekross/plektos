import {
  getEventTimezone,
  formatEventDateTime,
  formatEventTime,
  getTimezoneAbbreviation,
  getUserTimezone,
} from "@/lib/eventTimezone";
import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting, InteractiveRoom } from "@/lib/eventTypes";
import { Clock, Globe } from "lucide-react";

interface TimezoneDisplayProps {
  event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom;
  showLocalTime?: boolean;
  className?: string;
}

export function TimezoneDisplay({
  event,
  showLocalTime = true,
  className = "",
}: TimezoneDisplayProps) {
  // LiveEvent (30311), InteractiveRoom (30312), and RoomMeeting (30313) use "starts" tag, others use "start"
  const startTime = (event.kind === 30311 || event.kind === 30312 || event.kind === 30313)
    ? event.tags.find((tag) => tag[0] === "starts")?.[1]
    : event.tags.find((tag) => tag[0] === "start")?.[1];
  const endTime = event.tags.find((tag) => tag[0] === "end")?.[1] || 
                  event.tags.find((tag) => tag[0] === "ends")?.[1];

  if (!startTime) {
    return <span className="text-muted-foreground">No time specified</span>;
  }

  // For live events (30311), interactive rooms (30312), and room meetings (30313), always treat as time-based events
  const effectiveKind = (event.kind === 30311 || event.kind === 30312 || event.kind === 30313) ? 31923 : event.kind;

  const eventTimezone = getEventTimezone(event);
  const userTimezone = getUserTimezone();
  const isLocalTimezone = eventTimezone === userTimezone;

  const getFormattedTime = () => {
    try {
      if (effectiveKind === 31922) {
        // Date-based events
        let startDate;
        if (startTime.match(/^\d{10}$/)) {
          startDate = new Date(parseInt(startTime) * 1000);
        } else if (startTime.match(/^\d{13}$/)) {
          startDate = new Date(parseInt(startTime));
        } else {
          // YYYY-MM-DD format
          const [year, month, day] = startTime.split("-").map(Number);
          if (isNaN(year) || isNaN(month) || isNaN(day)) {
            throw new Error("Invalid date format");
          }
          startDate = new Date(year, month - 1, day);
        }

        if (isNaN(startDate.getTime())) {
          throw new Error("Invalid date");
        }

        const timezoneAbbr = getTimezoneAbbreviation(
          eventTimezone,
          startDate.getTime()
        );

        if (endTime && endTime !== startTime) {
          let endDate;
          if (endTime.match(/^\d{10}$/)) {
            endDate = new Date(parseInt(endTime) * 1000);
          } else if (endTime.match(/^\d{13}$/)) {
            endDate = new Date(parseInt(endTime));
          } else {
            const [endYear, endMonth, endDay] = endTime.split("-").map(Number);
            if (!isNaN(endYear) && !isNaN(endMonth) && !isNaN(endDay)) {
              endDate = new Date(endYear, endMonth - 1, endDay);
            }
          }

          if (endDate && !isNaN(endDate.getTime())) {
            if (startDate.toDateString() === endDate.toDateString()) {
              return {
                eventTime:
                  formatEventDateTime(startDate.getTime(), eventTimezone) +
                  timezoneAbbr,
                localTime:
                  showLocalTime && !isLocalTimezone
                    ? formatEventDateTime(startDate.getTime(), userTimezone) +
                      getTimezoneAbbreviation(userTimezone, startDate.getTime())
                    : null,
              };
            }

            return {
              eventTime: `${formatEventDateTime(
                startDate.getTime(),
                eventTimezone
              )} - ${formatEventDateTime(
                endDate.getTime(),
                eventTimezone
              )}${timezoneAbbr}`,
              localTime:
                showLocalTime && !isLocalTimezone
                  ? `${formatEventDateTime(
                      startDate.getTime(),
                      userTimezone
                    )} - ${formatEventDateTime(
                      endDate.getTime(),
                      userTimezone
                    )}${getTimezoneAbbreviation(
                      userTimezone,
                      startDate.getTime()
                    )}`
                  : null,
            };
          }
        }

        return {
          eventTime:
            formatEventDateTime(startDate.getTime(), eventTimezone) +
            timezoneAbbr,
          localTime:
            showLocalTime && !isLocalTimezone
              ? formatEventDateTime(startDate.getTime(), userTimezone) +
                getTimezoneAbbreviation(userTimezone, startDate.getTime())
              : null,
        };
      } else {
        // Time-based events and live events - use robust timestamp parsing
        let timestamp = parseInt(startTime);
        
        // Handle both seconds and milliseconds timestamps
        if (timestamp < 10000000000) {
          // Likely in seconds, convert to milliseconds
          timestamp = timestamp * 1000;
        }
        
        const startDate = new Date(timestamp);
        if (isNaN(startDate.getTime())) {
          throw new Error("Invalid start date");
        }

        const timezoneAbbr = getTimezoneAbbreviation(
          eventTimezone,
          startDate.getTime()
        );

        if (endTime) {
          let endTimestamp = parseInt(endTime);
          
          // Handle both seconds and milliseconds timestamps
          if (endTimestamp < 10000000000) {
            // Likely in seconds, convert to milliseconds
            endTimestamp = endTimestamp * 1000;
          }
          
          const endDate = new Date(endTimestamp);
          if (!isNaN(endDate.getTime())) {
            const startDateTime = formatEventDateTime(
              startDate.getTime(),
              eventTimezone,
              {
                hour: "numeric",
                minute: "numeric",
              }
            );
            const endTimeOnly = formatEventTime(
              endDate.getTime(),
              eventTimezone
            );

            return {
              eventTime: `${startDateTime} - ${endTimeOnly}${timezoneAbbr}`,
              localTime:
                showLocalTime && !isLocalTimezone
                  ? `${formatEventDateTime(startDate.getTime(), userTimezone, {
                      hour: "numeric",
                      minute: "numeric",
                    })} - ${formatEventTime(
                      endDate.getTime(),
                      userTimezone
                    )}${getTimezoneAbbreviation(
                      userTimezone,
                      startDate.getTime()
                    )}`
                  : null,
            };
          }
        }

        const startDateTime = formatEventDateTime(
          startDate.getTime(),
          eventTimezone,
          {
            hour: "numeric",
            minute: "numeric",
          }
        );

        return {
          eventTime: `${startDateTime}${timezoneAbbr}`,
          localTime:
            showLocalTime && !isLocalTimezone
              ? `${formatEventDateTime(startDate.getTime(), userTimezone, {
                  hour: "numeric",
                  minute: "numeric",
                })}${getTimezoneAbbreviation(
                  userTimezone,
                  startDate.getTime()
                )}`
              : null,
        };
      }
    } catch {
      return {
        eventTime: "Invalid date",
        localTime: null,
      };
    }
  };

  const { eventTime, localTime } = getFormattedTime();

  // Show a warning if no timezone was detected for the event
  const noTimezoneDetected = !eventTimezone;

  if (!showLocalTime || !localTime || isLocalTimezone) {
    return (
      <span className={`inline-flex flex-col gap-1 ${className}`}>
        <span className="inline-flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{eventTime}</span>
        </span>
        {noTimezoneDetected && (
          <span className="inline-flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-amber-600">
              Timezone not specified - showing in your local time
            </span>
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <span className="inline-flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span>{eventTime}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {localTime} (your time)
        </span>
      </span>
      {noTimezoneDetected && (
        <span className="inline-flex items-center gap-2">
          <Globe className="h-4 w-4 text-amber-500" />
          <span className="text-xs text-amber-600">
            Event timezone not specified
          </span>
        </span>
      )}
    </span>
  );
}
