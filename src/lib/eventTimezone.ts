import { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting, InteractiveRoom } from "@/lib/eventTypes";

/**
 * Event timezone detection and formatting utilities.
 *
 * Supports timezone detection from multiple sources:
 * 1. NIP-52 timezone tags (start_tzid, end_tzid) - highest priority
 * 2. Other common timezone tags (tzid, timezone)
 * 3. Location-based timezone mapping - fallback
 *
 * For kind 31923 (time-based) events, the following tags are checked in order:
 * - start_tzid: Official NIP-52 timezone for start time
 * - end_tzid: Official NIP-52 timezone for end time
 * - tzid: Generic timezone identifier
 * - timezone: Alternative timezone tag
 *
 * Example usage:
 * Tags: [["start_tzid", "Europe/Madrid"], ["start", "1640995200"]]
 * Result: Event displayed in Madrid timezone (CET/CEST)
 */

// Comprehensive list of timezones organized by region
export const TIMEZONES = {
  // North America
  "America/New_York": "Eastern Time (ET)",
  "America/Chicago": "Central Time (CT)",
  "America/Denver": "Mountain Time (MT)",
  "America/Phoenix": "Mountain Time - Arizona (MT)",
  "America/Los_Angeles": "Pacific Time (PT)",
  "America/Anchorage": "Alaska Time (AKT)",
  "Pacific/Honolulu": "Hawaii Time (HT)",
  "America/Toronto": "Eastern Time - Toronto",
  "America/Vancouver": "Pacific Time - Vancouver",
  "America/Montreal": "Eastern Time - Montreal",
  "America/Edmonton": "Mountain Time - Edmonton",
  "America/Winnipeg": "Central Time - Winnipeg",
  "America/Halifax": "Atlantic Time - Halifax",
  "America/St_Johns": "Newfoundland Time",
  "America/Mexico_City": "Central Time - Mexico",
  "America/Tijuana": "Pacific Time - Tijuana",
  "America/Guatemala": "Central Time - Guatemala",
  "America/El_Salvador": "Central Time - El Salvador",
  "America/Managua": "Central Time - Nicaragua",
  "America/Costa_Rica": "Central Time - Costa Rica",
  "America/Panama": "Eastern Time - Panama",
  "America/Bogota": "Colombia Time",
  "America/Lima": "Peru Time",
  "America/Caracas": "Venezuela Time",
  "America/La_Paz": "Bolivia Time",
  "America/Santiago": "Chile Time",
  "America/Asuncion": "Paraguay Time",
  "America/Montevideo": "Uruguay Time",
  "America/Argentina/Buenos_Aires": "Argentina Time",
  "America/Sao_Paulo": "Brazil Time",
  "America/Cayenne": "French Guiana Time",
  "America/Paramaribo": "Suriname Time",
  "America/Guyana": "Guyana Time",

  // Europe
  "Europe/London": "Greenwich Mean Time (GMT)",
  "Europe/Paris": "Central European Time (CET)",
  "Europe/Berlin": "Central European Time (CET)",
  "Europe/Rome": "Central European Time (CET)",
  "Europe/Madrid": "Central European Time (CET)",
  "Europe/Amsterdam": "Central European Time (CET)",
  "Europe/Brussels": "Central European Time (CET)",
  "Europe/Vienna": "Central European Time (CET)",
  "Europe/Zurich": "Central European Time (CET)",
  "Europe/Prague": "Central European Time (CET)",
  "Europe/Warsaw": "Central European Time (CET)",
  "Europe/Budapest": "Central European Time (CET)",
  "Europe/Bratislava": "Central European Time (CET)",
  "Europe/Ljubljana": "Central European Time (CET)",
  "Europe/Zagreb": "Central European Time (CET)",
  "Europe/Belgrade": "Central European Time (CET)",
  "Europe/Sofia": "Eastern European Time (EET)",
  "Europe/Bucharest": "Eastern European Time (EET)",
  "Europe/Athens": "Eastern European Time (EET)",
  "Europe/Istanbul": "Turkey Time",
  "Europe/Moscow": "Moscow Time",
  "Europe/Kiev": "Eastern European Time (EET)",
  "Europe/Minsk": "Moscow Time",
  "Europe/Riga": "Eastern European Time (EET)",
  "Europe/Tallinn": "Eastern European Time (EET)",
  "Europe/Vilnius": "Eastern European Time (EET)",
  "Europe/Helsinki": "Eastern European Time (EET)",
  "Europe/Stockholm": "Central European Time (CET)",
  "Europe/Oslo": "Central European Time (CET)",
  "Europe/Copenhagen": "Central European Time (CET)",
  "Europe/Dublin": "Greenwich Mean Time (GMT)",
  "Europe/Lisbon": "Western European Time (WET)",
  "Europe/Reykjavik": "Greenwich Mean Time (GMT)",

  // Asia
  "Asia/Tokyo": "Japan Standard Time (JST)",
  "Asia/Seoul": "Korea Standard Time (KST)",
  "Asia/Shanghai": "China Standard Time (CST)",
  "Asia/Beijing": "China Standard Time (CST)",
  "Asia/Hong_Kong": "Hong Kong Time (HKT)",
  "Asia/Singapore": "Singapore Time (SGT)",
  "Asia/Bangkok": "Indochina Time (ICT)",
  "Asia/Ho_Chi_Minh": "Indochina Time (ICT)",
  "Asia/Manila": "Philippine Time (PHT)",
  "Asia/Jakarta": "Western Indonesian Time (WIB)",
  "Asia/Makassar": "Central Indonesian Time (WITA)",
  "Asia/Jayapura": "Eastern Indonesian Time (WIT)",
  "Asia/Kuala_Lumpur": "Malaysia Time (MYT)",
  "Asia/Yangon": "Myanmar Time (MMT)",
  "Asia/Dhaka": "Bangladesh Standard Time (BST)",
  "Asia/Kolkata": "India Standard Time (IST)",
  "Asia/Kathmandu": "Nepal Time (NPT)",
  "Asia/Colombo": "Sri Lanka Time (SLT)",
  "Asia/Karachi": "Pakistan Standard Time (PKT)",
  "Asia/Tashkent": "Uzbekistan Time (UZT)",
  "Asia/Almaty": "Kazakhstan Time (ALMT)",
  "Asia/Bishkek": "Kyrgyzstan Time (KGT)",
  "Asia/Dushanbe": "Tajikistan Time (TJT)",
  "Asia/Ashgabat": "Turkmenistan Time (TMT)",
  "Asia/Baku": "Azerbaijan Time (AZT)",
  "Asia/Tbilisi": "Georgia Time (GET)",
  "Asia/Yerevan": "Armenia Time (AMT)",
  "Asia/Tehran": "Iran Standard Time (IRST)",
  "Asia/Dubai": "Gulf Standard Time (GST)",
  "Asia/Muscat": "Gulf Standard Time (GST)",
  "Asia/Qatar": "Arabia Standard Time (AST)",
  "Asia/Kuwait": "Arabia Standard Time (AST)",
  "Asia/Riyadh": "Arabia Standard Time (AST)",
  "Asia/Baghdad": "Arabia Standard Time (AST)",
  "Asia/Amman": "Arabia Standard Time (AST)",
  "Asia/Beirut": "Arabia Standard Time (AST)",
  "Asia/Damascus": "Arabia Standard Time (AST)",
  "Asia/Jerusalem": "Israel Standard Time (IST)",
  "Asia/Gaza": "Palestine Time (PSE)",
  "Asia/Hebron": "Palestine Time (PSE)",

  // Africa
  "Africa/Cairo": "Eastern European Time (EET)",
  "Africa/Johannesburg": "South Africa Standard Time (SAST)",
  "Africa/Lagos": "West Africa Time (WAT)",
  "Africa/Nairobi": "East Africa Time (EAT)",
  "Africa/Casablanca": "Western European Time (WET)",
  "Africa/Algiers": "Central European Time (CET)",
  "Africa/Tunis": "Central European Time (CET)",
  "Africa/Tripoli": "Eastern European Time (EET)",
  "Africa/Khartoum": "Central Africa Time (CAT)",
  "Africa/Addis_Ababa": "East Africa Time (EAT)",
  "Africa/Dar_es_Salaam": "East Africa Time (EAT)",
  "Africa/Kampala": "East Africa Time (EAT)",
  "Africa/Kinshasa": "West Africa Time (WAT)",
  "Africa/Luanda": "West Africa Time (WAT)",
  "Africa/Brazzaville": "West Africa Time (WAT)",
  "Africa/Libreville": "West Africa Time (WAT)",
  "Africa/Douala": "West Africa Time (WAT)",
  "Africa/Malabo": "West Africa Time (WAT)",
  "Africa/Bangui": "West Africa Time (WAT)",
  "Africa/Ndjamena": "West Africa Time (WAT)",
  "Africa/Banjul": "Greenwich Mean Time (GMT)",
  "Africa/Dakar": "Greenwich Mean Time (GMT)",
  "Africa/Conakry": "Greenwich Mean Time (GMT)",
  "Africa/Bissau": "Greenwich Mean Time (GMT)",
  "Africa/Freetown": "Greenwich Mean Time (GMT)",
  "Africa/Monrovia": "Greenwich Mean Time (GMT)",
  "Africa/Accra": "Greenwich Mean Time (GMT)",
  "Africa/Lome": "Greenwich Mean Time (GMT)",
  "Africa/Porto-Novo": "West Africa Time (WAT)",
  "Africa/Niamey": "West Africa Time (WAT)",
  "Africa/Ouagadougou": "Greenwich Mean Time (GMT)",
  "Africa/Abidjan": "Greenwich Mean Time (GMT)",
  "Africa/Bamako": "Greenwich Mean Time (GMT)",
  "Africa/Nouakchott": "Greenwich Mean Time (GMT)",
  "Africa/El_Aaiun": "Western European Time (WET)",

  // Oceania
  "Australia/Sydney": "Australian Eastern Time (AET)",
  "Australia/Melbourne": "Australian Eastern Time (AET)",
  "Australia/Brisbane": "Australian Eastern Time (AET)",
  "Australia/Perth": "Australian Western Time (AWT)",
  "Australia/Adelaide": "Australian Central Time (ACT)",
  "Australia/Darwin": "Australian Central Time (ACT)",
  "Australia/Hobart": "Australian Eastern Time (AET)",
  "Pacific/Auckland": "New Zealand Standard Time (NZST)",
  "Pacific/Wellington": "New Zealand Standard Time (NZST)",
  "Pacific/Fiji": "Fiji Time (FJT)",
  "Pacific/Guam": "Chamorro Standard Time (ChST)",
  "Pacific/Saipan": "Chamorro Standard Time (ChST)",
  "Pacific/Port_Moresby": "Papua New Guinea Time (PGT)",
  "Pacific/Honiara": "Solomon Islands Time (SBT)",
  "Pacific/Noumea": "New Caledonia Time (NCT)",
  "Pacific/Vanuatu": "Vanuatu Time (VUT)",
  "Pacific/Tarawa": "Gilbert Islands Time (GILT)",
  "Pacific/Majuro": "Marshall Islands Time (MHT)",
  "Pacific/Palau": "Palau Time (PWT)",
  "Pacific/Chuuk": "Chuuk Time (CHUT)",
  "Pacific/Pohnpei": "Pohnpei Time (PONT)",
  "Pacific/Kosrae": "Kosrae Time (KOST)",
  "Pacific/Nauru": "Nauru Time (NRT)",
  "Pacific/Kiribati": "Phoenix Islands Time (PHOT)",
  "Pacific/Tahiti": "Tahiti Time (TAHT)",
  "Pacific/Marquesas": "Marquesas Time (MART)",
  "Pacific/Gambier": "Gambier Time (GAMT)",
  "Pacific/Easter": "Easter Island Time (EAST)",

  // UTC and other
  UTC: "Coordinated Universal Time (UTC)",
  GMT: "Greenwich Mean Time (GMT)",
  "Etc/UTC": "Coordinated Universal Time (UTC)",
  "Etc/GMT": "Greenwich Mean Time (GMT)",
  "Etc/GMT+1": "GMT-1",
  "Etc/GMT+2": "GMT-2",
  "Etc/GMT+3": "GMT-3",
  "Etc/GMT+4": "GMT-4",
  "Etc/GMT+5": "GMT-5",
  "Etc/GMT+6": "GMT-6",
  "Etc/GMT+7": "GMT-7",
  "Etc/GMT+8": "GMT-8",
  "Etc/GMT+9": "GMT-9",
  "Etc/GMT+10": "GMT-10",
  "Etc/GMT+11": "GMT-11",
  "Etc/GMT+12": "GMT-12",
  "Etc/GMT-1": "GMT+1",
  "Etc/GMT-2": "GMT+2",
  "Etc/GMT-3": "GMT+3",
  "Etc/GMT-4": "GMT+4",
  "Etc/GMT-5": "GMT+5",
  "Etc/GMT-6": "GMT+6",
  "Etc/GMT-7": "GMT+7",
  "Etc/GMT-8": "GMT+8",
  "Etc/GMT-9": "GMT+9",
  "Etc/GMT-10": "GMT+10",
  "Etc/GMT-11": "GMT+11",
  "Etc/GMT-12": "GMT+12",
};

// Common timezone mappings for major cities/regions (for location-based detection)
const TIMEZONE_MAP: Record<string, string> = {
  // US Cities
  "new york": "America/New_York",
  nyc: "America/New_York",
  manhattan: "America/New_York",
  brooklyn: "America/New_York",
  chicago: "America/Chicago",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  sf: "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  denver: "America/Denver",
  phoenix: "America/Phoenix",
  arizona: "America/Phoenix",
  miami: "America/New_York",
  atlanta: "America/New_York",
  dallas: "America/Chicago",
  houston: "America/Chicago",
  austin: "America/Chicago",
  "las vegas": "America/Los_Angeles",
  portland: "America/Los_Angeles",
  boston: "America/New_York",
  washington: "America/New_York",
  dc: "America/New_York",

  // International
  london: "Europe/London",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  amsterdam: "Europe/Amsterdam",
  rome: "Europe/Rome",
  madrid: "Europe/Madrid",
  barcelona: "Europe/Madrid",
  zurich: "Europe/Zurich",
  vienna: "Europe/Vienna",
  prague: "Europe/Prague",
  stockholm: "Europe/Stockholm",
  copenhagen: "Europe/Copenhagen",
  oslo: "Europe/Oslo",
  helsinki: "Europe/Helsinki",
  dublin: "Europe/Dublin",
  lisbon: "Europe/Lisbon",
  athens: "Europe/Athens",
  moscow: "Europe/Moscow",
  istanbul: "Europe/Istanbul",
  tokyo: "Asia/Tokyo",
  osaka: "Asia/Tokyo",
  seoul: "Asia/Seoul",
  beijing: "Asia/Shanghai",
  shanghai: "Asia/Shanghai",
  "hong kong": "Asia/Hong_Kong",
  singapore: "Asia/Singapore",
  mumbai: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  bangalore: "Asia/Kolkata",
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  brisbane: "Australia/Brisbane",
  perth: "Australia/Perth",
  auckland: "Pacific/Auckland",
  wellington: "Pacific/Auckland",
  toronto: "America/Toronto",
  vancouver: "America/Vancouver",
  montreal: "America/Montreal",
  "mexico city": "America/Mexico_City",
  "sao paulo": "America/Sao_Paulo",
  "rio de janeiro": "America/Sao_Paulo",
  "buenos aires": "America/Argentina/Buenos_Aires",
  santiago: "America/Santiago",
  lima: "America/Lima",
  bogota: "America/Bogota",
  caracas: "America/Caracas",
  "cape town": "Africa/Johannesburg",
  johannesburg: "Africa/Johannesburg",
  cairo: "Africa/Cairo",
  lagos: "Africa/Lagos",
  nairobi: "Africa/Nairobi",
  casablanca: "Africa/Casablanca",

  // States/Regions
  california: "America/Los_Angeles",
  texas: "America/Chicago",
  florida: "America/New_York",
  "new york state": "America/New_York",
  illinois: "America/Chicago",
  "washington state": "America/Los_Angeles",
  oregon: "America/Los_Angeles",

  // Countries (use major city timezone)
  usa: "America/New_York",
  "united states": "America/New_York",
  uk: "Europe/London",
  "united kingdom": "Europe/London",
  england: "Europe/London",
  france: "Europe/Paris",
  germany: "Europe/Berlin",
  italy: "Europe/Rome",
  spain: "Europe/Madrid",
  netherlands: "Europe/Amsterdam",
  switzerland: "Europe/Zurich",
  austria: "Europe/Vienna",
  belgium: "Europe/Brussels",
  sweden: "Europe/Stockholm",
  norway: "Europe/Oslo",
  denmark: "Europe/Copenhagen",
  finland: "Europe/Helsinki",
  ireland: "Europe/Dublin",
  portugal: "Europe/Lisbon",
  greece: "Europe/Athens",
  poland: "Europe/Warsaw",
  japan: "Asia/Tokyo",
  "south korea": "Asia/Seoul",
  korea: "Asia/Seoul",
  china: "Asia/Shanghai",
  india: "Asia/Kolkata",
  australia: "Australia/Sydney",
  canada: "America/Toronto",
  mexico: "America/Mexico_City",
  brazil: "America/Sao_Paulo",
  argentina: "America/Argentina/Buenos_Aires",
  chile: "America/Santiago",
  peru: "America/Lima",
  colombia: "America/Bogota",
  venezuela: "America/Caracas",
  "south africa": "Africa/Johannesburg",
  egypt: "Africa/Cairo",
  nigeria: "Africa/Lagos",
  kenya: "Africa/Nairobi",
  morocco: "Africa/Casablanca",
};

/**
 * Gets the user's local timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Validates if a timezone identifier is valid
 */
function isValidTimezone(timezone: string): boolean {
  try {
    // Try to create a DateTimeFormat with the timezone
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to detect the timezone for an event based on timezone tags and location
 */
export function getEventTimezone(
  event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom
): string | null {
  // First, check for explicit timezone tags (NIP-52 and other standards)
  const startTzid = event.tags.find((tag) => tag[0] === "start_tzid")?.[1];
  if (startTzid && isValidTimezone(startTzid)) {
    return startTzid;
  }

  // For time-based events, also check for end_tzid as fallback
  if (event.kind === 31923) {
    const endTzid = event.tags.find((tag) => tag[0] === "end_tzid")?.[1];
    if (endTzid && isValidTimezone(endTzid)) {
      return endTzid;
    }

    // Check for other common timezone tags
    const tzid = event.tags.find((tag) => tag[0] === "tzid")?.[1];
    if (tzid && isValidTimezone(tzid)) {
      return tzid;
    }

    const timezone = event.tags.find((tag) => tag[0] === "timezone")?.[1];
    if (timezone && isValidTimezone(timezone)) {
      return timezone;
    }
  }

  // Also check for date-based events (kind 31922) timezone tags
  if (event.kind === 31922) {
    const tzid = event.tags.find((tag) => tag[0] === "tzid")?.[1];
    if (tzid && isValidTimezone(tzid)) {
      return tzid;
    }

    const timezone = event.tags.find((tag) => tag[0] === "timezone")?.[1];
    if (timezone && isValidTimezone(timezone)) {
      return timezone;
    }
  }

  // Fallback to location-based timezone detection
  const location = event.tags.find((tag) => tag[0] === "location")?.[1];
  if (!location) {
    return null;
  }

  const locationLower = location.toLowerCase().trim();

  // Try exact match first
  if (TIMEZONE_MAP[locationLower]) {
    return TIMEZONE_MAP[locationLower];
  }

  // Try partial matches
  for (const [key, timezone] of Object.entries(TIMEZONE_MAP)) {
    if (locationLower.includes(key)) {
      return timezone;
    }
  }

  return null;
}

/**
 * Formats a date in the event's local timezone if detectable, otherwise uses browser timezone
 */
export function formatEventDateTime(
  timestamp: number,
  timezone: string | null,
  options: Intl.DateTimeFormatOptions = {}
): string {
  let date: Date;
  
  try {
    // If timestamp is a string, parse it safely
    if (typeof timestamp === 'string') {
      const parsedTimestamp = parseTimestamp(timestamp);
      date = new Date(parsedTimestamp);
    } else {
      // If it's already a number, check if it needs conversion
      if (timestamp < 10000000000) {
        // Likely in seconds, convert to milliseconds
        date = new Date(timestamp * 1000);
      } else {
        // Likely already in milliseconds
        date = new Date(timestamp);
      }
    }
    
    // Validate the resulting date
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date created from timestamp: ${timestamp}`);
    }
    
  } catch {
    // Fallback to current time to prevent crashes
    date = new Date();
  }

  const formatOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  };

  if (timezone) {
    try {
      return date.toLocaleDateString(undefined, {
        ...formatOptions,
        timeZone: timezone,
      });
    } catch {
      // Invalid timezone, fall through to browser timezone
    }
  }

  // Fallback to browser timezone
  return date.toLocaleDateString(undefined, formatOptions);
}

/**
 * Safely parses a timestamp string to milliseconds
 * Handles both seconds and milliseconds timestamps, and validates the result
 */
function parseTimestamp(timestampStr: string): number {
  const timestamp = parseInt(timestampStr);
  
  if (isNaN(timestamp)) {
    throw new Error(`Invalid timestamp: ${timestampStr}`);
  }
  
  // If the timestamp is less than 10 digits, it's likely in seconds
  // If it's 10 digits or more, it could be seconds or milliseconds
  // We need to determine which based on the magnitude
  
  // Timestamps in seconds for dates after 2001 will be > 1000000000 (10 digits)
  // Timestamps in milliseconds for dates after 2001 will be > 1000000000000 (13 digits)
  
  if (timestamp < 1000000000) {
    // Less than 10 digits - definitely seconds, but very old date (before 2001)
    // This is likely an error, but we'll treat it as seconds
    return timestamp * 1000;
  } else if (timestamp < 10000000000) {
    // 10 digits - definitely seconds (dates between 2001-2286)
    return timestamp * 1000;
  } else if (timestamp < 100000000000) {
    // 11 digits - could be seconds for far future dates, but more likely an error
    // Let's check if treating it as seconds gives a reasonable date
    const asSeconds = new Date(timestamp * 1000);
    
    // If treating as seconds gives a date far in the future (after 2100),
    // it's probably meant to be milliseconds
    if (asSeconds.getFullYear() > 2100) {
      return timestamp;
    } else {
      return timestamp * 1000;
    }
  } else if (timestamp < 10000000000000) {
    // 12 digits - likely milliseconds, but could be seconds for very far future
    const asSeconds = new Date(timestamp * 1000);
    const asMilliseconds = new Date(timestamp);
    
    // If treating as seconds gives an unreasonable date (after year 3000), treat as milliseconds
    if (asSeconds.getFullYear() > 3000) {
      return timestamp;
    } else {
      // Check which interpretation gives a more reasonable date (closer to now)
      const now = Date.now();
      const diffAsSeconds = Math.abs(asSeconds.getTime() - now);
      const diffAsMilliseconds = Math.abs(asMilliseconds.getTime() - now);
      
      if (diffAsMilliseconds < diffAsSeconds) {
        return timestamp;
      } else {
        return timestamp * 1000;
      }
    }
  } else {
    // 13+ digits - definitely milliseconds
    return timestamp;
  }
}

/**
 * Formats a time in the event's local timezone if detectable, otherwise uses browser timezone
 */
export function formatEventTime(
  timestamp: number,
  timezone: string | null,
  options: Intl.DateTimeFormatOptions = {}
): string {
  let date: Date;
  
  try {
    // If timestamp is a string, parse it safely
    if (typeof timestamp === 'string') {
      const parsedTimestamp = parseTimestamp(timestamp);
      date = new Date(parsedTimestamp);
    } else {
      // If it's already a number, check if it needs conversion
      if (timestamp < 10000000000) {
        // Likely in seconds, convert to milliseconds
        date = new Date(timestamp * 1000);
      } else {
        // Likely already in milliseconds
        date = new Date(timestamp);
      }
    }
    
    // Validate the resulting date
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date created from timestamp: ${timestamp}`);
    }
    
  } catch {
    // Fallback to current time to prevent crashes
    date = new Date();
  }

  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "numeric",
    ...options,
  };

  if (timezone) {
    try {
      return date.toLocaleTimeString(undefined, {
        ...formatOptions,
        timeZone: timezone,
      });
    } catch {
      // Invalid timezone, fall through to browser timezone
    }
  }

  // Fallback to browser timezone
  return date.toLocaleTimeString(undefined, formatOptions);
}

/**
 * Gets the timezone abbreviation for a given timezone and timestamp
 */
export function getTimezoneAbbreviation(
  timezone: string | null,
  timestamp: number = Date.now()
): string {
  if (!timezone) {
    return "";
  }

  try {
    const date = new Date(timestamp);
    const timeZoneName = date.toLocaleString("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    });

    // Extract the timezone abbreviation (last part after space)
    const parts = timeZoneName.split(" ");
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

/**
 * Gets a formatted timezone list for display in select components
 */
export function getTimezoneOptions(): Array<{ value: string; label: string }> {
  return Object.entries(TIMEZONES).map(([value, label]) => ({
    value,
    label: `${label} (${value})`,
  }));
}

/**
 * Gets timezone options grouped by region for better organization
 */
export function getGroupedTimezoneOptions(): Array<{
  group: string;
  options: Array<{ value: string; label: string }>;
}> {
  const groups: Record<string, Array<{ value: string; label: string }>> = {
    "North America": [],
    Europe: [],
    Asia: [],
    Africa: [],
    Oceania: [],
    Other: [],
  };

  Object.entries(TIMEZONES).forEach(([value, label]) => {
    if (value.startsWith("America/")) {
      groups["North America"].push({ value, label: `${label} (${value})` });
    } else if (value.startsWith("Europe/")) {
      groups["Europe"].push({ value, label: `${label} (${value})` });
    } else if (value.startsWith("Asia/")) {
      groups["Asia"].push({ value, label: `${label} (${value})` });
    } else if (value.startsWith("Africa/")) {
      groups["Africa"].push({ value, label: `${label} (${value})` });
    } else if (value.startsWith("Australia/") || value.startsWith("Pacific/")) {
      groups["Oceania"].push({ value, label: `${label} (${value})` });
    } else {
      groups["Other"].push({ value, label: `${label} (${value})` });
    }
  });

  return Object.entries(groups)
    .filter(([_, options]) => options.length > 0)
    .map(([group, options]) => ({ group, options }));
}

/**
 * Converts a date and time in a specific timezone to a Unix timestamp
 */
export function createTimestampInTimezone(
  dateString: string, // YYYY-MM-DD format
  timeString: string, // HH:MM format
  timezone: string
): number {
  try {
    // Parse the date and time components
    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes] = timeString.split(':').map(Number);

    // The key insight: we want to create a timestamp that, when converted back to the target timezone,
    // displays the exact date and time the user specified.
    
    // Step 1: Create a date object representing the desired time in the target timezone
    // We'll use a binary search approach to find the correct UTC timestamp
    
    let low = new Date(year, month - 1, day, hours, minutes).getTime() - (24 * 60 * 60 * 1000); // 24 hours before
    let high = new Date(year, month - 1, day, hours, minutes).getTime() + (24 * 60 * 60 * 1000); // 24 hours after
    
    // Binary search to find the UTC timestamp that gives us the right local time
    while (high - low > 60000) { // Within 1 minute accuracy
      const mid = Math.floor((low + high) / 2);
      const testDate = new Date(mid);
      
      // Check what time this UTC timestamp shows in the target timezone
      const timeInTargetTz = testDate.toLocaleString("en-CA", {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      // Parse the result
      const [datePart, timePart] = timeInTargetTz.split(', ');
      const [tzYear, tzMonth, tzDay] = datePart.split('-').map(Number);
      const [tzHours, tzMinutes] = timePart.split(':').map(Number);
      
      // Compare with our target
      if (tzYear < year || (tzYear === year && tzMonth < month) || 
          (tzYear === year && tzMonth === month && tzDay < day) ||
          (tzYear === year && tzMonth === month && tzDay === day && tzHours < hours) ||
          (tzYear === year && tzMonth === month && tzDay === day && tzHours === hours && tzMinutes < minutes)) {
        low = mid;
      } else if (tzYear > year || (tzYear === year && tzMonth > month) || 
                 (tzYear === year && tzMonth === month && tzDay > day) ||
                 (tzYear === year && tzMonth === month && tzDay === day && tzHours > hours) ||
                 (tzYear === year && tzMonth === month && tzDay === day && tzHours === hours && tzMinutes > minutes)) {
        high = mid;
      } else {
        // Exact match found
        return Math.floor(mid / 1000);
      }
    }
    
    // Return the closest match
    return Math.floor(low / 1000);
    
  } catch {
    // Fallback to a simpler approach
    const dateTimeString = `${dateString}T${timeString}:00`;
    const localDate = new Date(dateTimeString);

    // Get the user's timezone offset and the target timezone offset
    const userOffset = localDate.getTimezoneOffset() * 60 * 1000; // in milliseconds

    // Create a rough estimate by assuming the target timezone offset
    try {
      const testDate = new Date();
      const utcTime = testDate.getTime() + (testDate.getTimezoneOffset() * 60000);
      const targetTime = new Date(utcTime + getTimezoneOffsetForDate(testDate, timezone));
      const targetOffset = testDate.getTime() - targetTime.getTime();

      const adjustedTime = localDate.getTime() + userOffset - targetOffset;
      return Math.floor(adjustedTime / 1000);
    } catch {
      return Math.floor(localDate.getTime() / 1000);
    }
  }
}



/**
 * Gets the timezone offset in milliseconds for a specific timezone and date
 */
function getTimezoneOffsetForDate(date: Date, timezone: string): number {
  try {
    // Get the time in the target timezone
    const timeInTargetTz = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
    
    // Get the time in UTC
    const timeInUtc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    
    // The difference is the offset
    return timeInTargetTz.getTime() - timeInUtc.getTime();
  } catch {
    return 0;
  }
}
