import React from "react";
import { ExternalLink, MapPin, Globe, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationDisplayProps {
  location: string;
  className?: string;
}

const isURL = (text: string): boolean => {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    // Try with https:// prefix if it looks like a domain
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(text.trim())) {
      try {
        new URL(`https://${text}`);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
};

const getLocationIcon = (location: string) => {
  const lowerLocation = location.toLowerCase();

  // Check if it's a URL
  if (isURL(location)) {
    if (lowerLocation.includes("maps.google") ||
      lowerLocation.includes("goo.gl/maps") ||
      lowerLocation.includes("openstreetmap") ||
      lowerLocation.includes("mapquest") ||
      lowerLocation.includes("bing.com/maps")) {
      return <MapPin className="h-4 w-4" />;
    }
    return <Globe className="h-4 w-4" />;
  }

  // Check if it looks like a file path
  if (location.includes("/") && !location.includes(" ")) {
    return <FileText className="h-4 w-4" />;
  }

  // Default to map pin for addresses
  return <MapPin className="h-4 w-4" />;
};

const formatURL = (location: string): string => {
  if (location.startsWith("http://") || location.startsWith("https://")) {
    return location;
  }

  // Add https:// prefix if it looks like a domain
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(location.trim())) {
    return `https://${location}`;
  }

  return location;
};

export function LocationDisplay({ location, className }: LocationDisplayProps) {
  if (!location) {
    return null;
  }

  const locationIsClickable = isURL(location);
  const icon = getLocationIcon(location);
  const displayLocation = location.trim();

  if (locationIsClickable) {
    return (
      <a
        href={formatURL(displayLocation)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline",
          className
        )}
      >
        {icon}
        <span>{displayLocation}</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayLocation)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline",
        className
      )}
    >
      {icon}
      <span>{displayLocation}</span>
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
