import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting } from "./eventTypes";

function formatDateForICS(dateStr: string, isTimeBasedEvent: boolean): string {
  if (isTimeBasedEvent) {
    // Handle Unix timestamps (seconds)
    let timestamp: number;
    if (dateStr.match(/^\d{10}$/)) {
      // 10-digit Unix timestamp (seconds)
      timestamp = parseInt(dateStr) * 1000;
    } else if (dateStr.match(/^\d{13}$/)) {
      // 13-digit Unix timestamp (milliseconds)
      timestamp = parseInt(dateStr);
    } else {
      throw new Error(`Invalid timestamp format: ${dateStr}`);
    }
    
    const date = new Date(timestamp);
    // Format as UTC datetime: YYYYMMDDTHHMMSSZ
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  } else {
    // Handle ISO 8601 date format (YYYY-MM-DD) for all-day events
    const date = new Date(dateStr + 'T00:00:00Z');
    // Format as date only: YYYYMMDD
    return date.toISOString().split('T')[0].replace(/-/g, '');
  }
}

export function generateICS(event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting): string {
  const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
  // LiveEvent (30311) and RoomMeeting (30313) use "starts"/"ends" tags, others use "start"/"end"
  const startTag = (event.kind === 30311 || event.kind === 30313)
    ? event.tags.find((tag) => tag[0] === "starts")?.[1]
    : event.tags.find((tag) => tag[0] === "start")?.[1];
  const endTag = event.tags.find((tag) => tag[0] === "end")?.[1] || 
                 event.tags.find((tag) => tag[0] === "ends")?.[1];
  const location = event.tags.find((tag) => tag[0] === "location")?.[1];
  
  if (!startTag) {
    throw new Error("Event must have a start time");
  }

  // Time-based events: 31923 (time-based), 30311 (live events), 30313 (room meetings)
  const isTimeBasedEvent = event.kind === 31923 || event.kind === 30311 || event.kind === 30313;
  
  // Format dates according to ICS specification
  const dtstart = formatDateForICS(startTag, isTimeBasedEvent);
  const dtend = endTag ? formatDateForICS(endTag, isTimeBasedEvent) : dtstart;
  
  // Add VALUE parameter for all-day events
  const startProperty = isTimeBasedEvent ? `DTSTART:${dtstart}` : `DTSTART;VALUE=DATE:${dtstart}`;
  const endProperty = isTimeBasedEvent ? `DTEND:${dtend}` : `DTEND;VALUE=DATE:${dtend}`;
  
  // Generate a unique identifier for the event
  const uid = `${event.id}@nostr-event`;
  
  // Get current timestamp in ICS format for DTSTAMP
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nostr Event Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    startProperty,
    endProperty,
    `SUMMARY:${title}`,
    `DESCRIPTION:${event.content.replace(/\n/g, '\\n')}`,
    location ? `LOCATION:${location}` : "",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(line => line !== "").join("\r\n");

  return ics;
}

export function downloadICS(event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting) {
  const ics = generateICS(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${
    event.tags.find((tag) => tag[0] === "title")?.[1] || "event"
  }.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openInCalendar(event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting) {
  const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
  const description = event.content || "";
  const location = event.tags.find((tag) => tag[0] === "location")?.[1] || "";
  
  // Get start and end times
  const startTag = (event.kind === 30311 || event.kind === 30313)
    ? event.tags.find((tag) => tag[0] === "starts")?.[1]
    : event.tags.find((tag) => tag[0] === "start")?.[1];
  const endTag = event.tags.find((tag) => tag[0] === "end")?.[1] || 
                 event.tags.find((tag) => tag[0] === "ends")?.[1];
  
  if (!startTag) {
    throw new Error("Event must have a start time");
  }

  // Determine if this is a time-based event
  const isTimeBasedEvent = event.kind === 31923 || event.kind === 30311 || event.kind === 30313;
  
  let startDate: Date;
  let endDate: Date;
  
  if (isTimeBasedEvent) {
    // Handle Unix timestamps
    let timestamp: number;
    if (startTag.match(/^\d{10}$/)) {
      timestamp = parseInt(startTag) * 1000;
    } else if (startTag.match(/^\d{13}$/)) {
      timestamp = parseInt(startTag);
    } else {
      throw new Error(`Invalid timestamp format: ${startTag}`);
    }
    startDate = new Date(timestamp);
    
    if (endTag) {
      let endTimestamp: number;
      if (endTag.match(/^\d{10}$/)) {
        endTimestamp = parseInt(endTag) * 1000;
      } else if (endTag.match(/^\d{13}$/)) {
        endTimestamp = parseInt(endTag);
      } else {
        throw new Error(`Invalid timestamp format: ${endTag}`);
      }
      endDate = new Date(endTimestamp);
    } else {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Default to 1 hour
    }
  } else {
    // Handle date-only events
    startDate = new Date(startTag + 'T00:00:00Z');
    endDate = endTag ? new Date(endTag + 'T00:00:00Z') : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
  }

  // Format dates for calendar URLs
  const formatDateForURL = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const startFormatted = formatDateForURL(startDate);
  const endFormatted = formatDateForURL(endDate);

  // Create calendar URLs for different providers
  const calendarUrls = {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startFormatted}/${endFormatted}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${startFormatted}&enddt=${endFormatted}&body=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`,
    yahoo: `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${encodeURIComponent(title)}&st=${startFormatted}&et=${endFormatted}&desc=${encodeURIComponent(description)}&in_loc=${encodeURIComponent(location)}`,
    apple: `data:text/calendar;charset=utf8,${encodeURIComponent(generateICS(event))}`
  };

  // Try to detect the user's preferred calendar
  const userAgent = navigator.userAgent.toLowerCase();
  let preferredCalendar = 'google'; // Default to Google Calendar

  if (userAgent.includes('mac') || userAgent.includes('iphone') || userAgent.includes('ipad')) {
    preferredCalendar = 'apple';
  } else if (userAgent.includes('windows') && userAgent.includes('outlook')) {
    preferredCalendar = 'outlook';
  }

  // Open the preferred calendar
  window.open(calendarUrls[preferredCalendar as keyof typeof calendarUrls], '_blank');
}

export function getCalendarOptions(event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting) {
  const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
  const description = event.content || "";
  const location = event.tags.find((tag) => tag[0] === "location")?.[1] || "";
  
  // Get start and end times
  const startTag = (event.kind === 30311 || event.kind === 30313)
    ? event.tags.find((tag) => tag[0] === "starts")?.[1]
    : event.tags.find((tag) => tag[0] === "start")?.[1];
  const endTag = event.tags.find((tag) => tag[0] === "end")?.[1] || 
                 event.tags.find((tag) => tag[0] === "ends")?.[1];
  
  if (!startTag) {
    throw new Error("Event must have a start time");
  }

  // Determine if this is a time-based event
  const isTimeBasedEvent = event.kind === 31923 || event.kind === 30311 || event.kind === 30313;
  
  let startDate: Date;
  let endDate: Date;
  
  if (isTimeBasedEvent) {
    // Handle Unix timestamps
    let timestamp: number;
    if (startTag.match(/^\d{10}$/)) {
      timestamp = parseInt(startTag) * 1000;
    } else if (startTag.match(/^\d{13}$/)) {
      timestamp = parseInt(startTag);
    } else {
      throw new Error(`Invalid timestamp format: ${startTag}`);
    }
    startDate = new Date(timestamp);
    
    if (endTag) {
      let endTimestamp: number;
      if (endTag.match(/^\d{10}$/)) {
        endTimestamp = parseInt(endTag) * 1000;
      } else if (endTag.match(/^\d{13}$/)) {
        endTimestamp = parseInt(endTag);
      } else {
        throw new Error(`Invalid timestamp format: ${endTag}`);
      }
      endDate = new Date(endTimestamp);
    } else {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Default to 1 hour
    }
  } else {
    // Handle date-only events
    startDate = new Date(startTag + 'T00:00:00Z');
    endDate = endTag ? new Date(endTag + 'T00:00:00Z') : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
  }

  // Format dates for calendar URLs
  const formatDateForURL = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const startFormatted = formatDateForURL(startDate);
  const endFormatted = formatDateForURL(endDate);

  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startFormatted}/${endFormatted}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${startFormatted}&enddt=${endFormatted}&body=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`,
    yahoo: `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${encodeURIComponent(title)}&st=${startFormatted}&et=${endFormatted}&desc=${encodeURIComponent(description)}&in_loc=${encodeURIComponent(location)}`,
    apple: `data:text/calendar;charset=utf8,${encodeURIComponent(generateICS(event))}`
  };
}
