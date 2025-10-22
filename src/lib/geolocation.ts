import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting, InteractiveRoom } from "./eventTypes";

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Calculate distance between two geographic points using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  point1: Coordinates,
  point2: Coordinates
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(point2.lat - point1.lat);
  const dLon = toRadians(point2.lng - point1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(point1.lat)) *
      Math.cos(toRadians(point2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Extract coordinates from an event's geohash or g tag
 * Returns null if no valid coordinates found
 */
export function getEventCoordinates(
  event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom
): Coordinates | null {
  // Look for 'g' tag which stores geohash (NIP-52)
  const gTag = event.tags.find((tag) => tag[0] === "g");
  if (gTag && gTag[1]) {
    const coords = parseGeohash(gTag[1]);
    if (coords) return coords;
  }

  // Look for explicit lat/lon tags (fallback)
  const latTag = event.tags.find((tag) => tag[0] === "lat");
  const lonTag = event.tags.find((tag) => tag[0] === "lon");
  
  if (latTag && lonTag && latTag[1] && lonTag[1]) {
    const lat = parseFloat(latTag[1]);
    const lng = parseFloat(lonTag[1]);
    
    if (!isNaN(lat) && !isNaN(lng) && isValidCoordinate({ lat, lng })) {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Simple geohash decoder - converts geohash string to approximate coordinates
 * This is a simplified version for display purposes
 */
function parseGeohash(geohash: string): Coordinates | null {
  if (!geohash) return null;
  
  // Geohash base32 character set
  const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  
  let evenBit = true;
  let latMin = -90.0, latMax = 90.0;
  let lonMin = -180.0, lonMax = 180.0;

  for (let i = 0; i < geohash.length; i++) {
    const char = geohash[i];
    const charIndex = BASE32.indexOf(char);
    
    if (charIndex === -1) return null;

    for (let j = 4; j >= 0; j--) {
      const bit = (charIndex >> j) & 1;
      
      if (evenBit) {
        // longitude
        const lonMid = (lonMin + lonMax) / 2;
        if (bit === 1) {
          lonMin = lonMid;
        } else {
          lonMax = lonMid;
        }
      } else {
        // latitude
        const latMid = (latMin + latMax) / 2;
        if (bit === 1) {
          latMin = latMid;
        } else {
          latMax = latMid;
        }
      }
      evenBit = !evenBit;
    }
  }

  const lat = (latMin + latMax) / 2;
  const lng = (lonMin + lonMax) / 2;
  
  if (isValidCoordinate({ lat, lng })) {
    return { lat, lng };
  }
  
  return null;
}

/**
 * Validate if coordinates are within valid ranges
 */
function isValidCoordinate(coord: Coordinates): boolean {
  return (
    coord.lat >= -90 &&
    coord.lat <= 90 &&
    coord.lng >= -180 &&
    coord.lng <= 180
  );
}

/**
 * Format distance in human-readable form
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  } else if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)}km`;
  } else {
    return `${Math.round(distanceKm)}km`;
  }
}

/**
 * Encode coordinates into a geohash string
 * Precision: number of characters in the geohash (more = more precise)
 */
export function encodeGeohash(
  lat: number,
  lng: number,
  precision: number = 9
): string {
  const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  
  let geohash = '';
  let evenBit = true;
  let latMin = -90.0, latMax = 90.0;
  let lonMin = -180.0, lonMax = 180.0;
  let bit = 0;
  let charIndex = 0;

  while (geohash.length < precision) {
    if (evenBit) {
      // longitude
      const lonMid = (lonMin + lonMax) / 2;
      if (lng > lonMid) {
        charIndex |= (1 << (4 - bit));
        lonMin = lonMid;
      } else {
        lonMax = lonMid;
      }
    } else {
      // latitude
      const latMid = (latMin + latMax) / 2;
      if (lat > latMid) {
        charIndex |= (1 << (4 - bit));
        latMin = latMid;
      } else {
        latMax = latMid;
      }
    }
    
    evenBit = !evenBit;

    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[charIndex];
      bit = 0;
      charIndex = 0;
    }
  }

  return geohash;
}

/**
 * Sort events by distance from a reference point
 */
export function sortEventsByDistance<T extends DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom>(
  events: T[],
  referencePoint: Coordinates
): Array<T & { distance?: number }> {
  return events
    .map(event => {
      const coords = getEventCoordinates(event);
      const distance = coords ? calculateDistance(referencePoint, coords) : undefined;
      return { ...event, distance };
    })
    .sort((a, b) => {
      // Events with coordinates come first, sorted by distance
      if (a.distance !== undefined && b.distance !== undefined) {
        return a.distance - b.distance;
      }
      if (a.distance !== undefined) return -1;
      if (b.distance !== undefined) return 1;
      return 0;
    });
}

