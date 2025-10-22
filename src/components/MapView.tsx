import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting, InteractiveRoom } from "@/lib/eventTypes";
import { getEventCoordinates } from "@/lib/geolocation";
import { createEventIdentifier } from "@/lib/nip19Utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimezoneDisplay } from "./TimezoneDisplay";
import { isLiveEvent } from "@/lib/liveEventUtils";
import { cn } from "@/lib/utils";

// Fix for default marker icons in Leaflet with Webpack/Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-expect-error - Leaflet icon setup
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface MapViewProps {
  events: Array<DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom>;
  className?: string;
}

interface EventMarker {
  event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom;
  coordinates: { lat: number; lng: number };
}

// Component to fit map bounds to markers
function FitBounds({ markers }: { markers: EventMarker[] }) {
  const map = useMap();
  
  useMemo(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(
        markers.map(m => [m.coordinates.lat, m.coordinates.lng])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [markers, map]);
  
  return null;
}

export function MapView({ events, className }: MapViewProps) {
  // Filter events that have valid coordinates
  const eventMarkers: EventMarker[] = useMemo(() => {
    return events
      .map(event => {
        const coordinates = getEventCoordinates(event);
        return coordinates ? { event, coordinates } : null;
      })
      .filter((marker): marker is EventMarker => marker !== null);
  }, [events]);

  // Default center (will be overridden by FitBounds if there are markers)
  const defaultCenter: [number, number] = [40.7128, -74.0060]; // New York City
  const defaultZoom = 10;

  if (eventMarkers.length === 0) {
    return (
      <Card className={cn("p-8 text-center", className)}>
        <div className="space-y-4">
          <div className="text-5xl">🗺️</div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">No Events with Locations</h3>
            <p className="text-muted-foreground">
              The events you're viewing don't have geographic coordinates.
              Add location data when creating events to see them on the map!
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className={cn("rounded-2xl overflow-hidden border-2 border-primary/10 shadow-lg", className)}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: "600px", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <FitBounds markers={eventMarkers} />
        
        {eventMarkers.map(({ event, coordinates }) => {
          const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
          const startTime = (event.kind === 30311 || event.kind === 30312 || event.kind === 30313)
            ? event.tags.find((tag) => tag[0] === "starts")?.[1]
            : event.tags.find((tag) => tag[0] === "start")?.[1];
          const location = event.tags.find((tag) => tag[0] === "location")?.[1];
          const eventIdentifier = createEventIdentifier(event);
          const live = isLiveEvent(event);

          return (
            <Marker
              key={event.id}
              position={[coordinates.lat, coordinates.lng]}
            >
              <Popup>
                <div className="min-w-[250px] p-2">
                  <Link 
                    to={`/event/${eventIdentifier}`}
                    className="block hover:opacity-80 transition-opacity"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <h3 className="font-semibold text-base leading-tight flex-1">
                          {title}
                        </h3>
                        {live && (
                          <Badge className="bg-red-500 text-white text-xs px-2 py-0.5">
                            LIVE
                          </Badge>
                        )}
                      </div>
                      
                      {startTime && (
                        <div className="text-sm text-muted-foreground">
                          <TimezoneDisplay 
                            event={event as DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom} 
                            showLocalTime={false}
                          />
                        </div>
                      )}
                      
                      {location && (
                        <div className="text-sm flex items-center gap-1 text-muted-foreground">
                          <span>📍</span>
                          <span className="line-clamp-1">{location}</span>
                        </div>
                      )}
                      
                      <div className="text-xs text-primary font-medium pt-1">
                        Click for details →
                      </div>
                    </div>
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      
      <div className="bg-muted/50 px-4 py-2 text-sm text-muted-foreground border-t">
        📍 Showing {eventMarkers.length} event{eventMarkers.length !== 1 ? 's' : ''} with location data
      </div>
    </div>
  );
}

