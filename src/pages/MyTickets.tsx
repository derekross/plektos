import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Ticket, History } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserRSVPs, type UserRSVPWithEvent, type UserTicketWithEvent } from "@/hooks/useUserRSVPs";
import { LoginArea } from "@/components/auth/LoginArea";
import { createEventIdentifier } from "@/lib/nip19Utils";
import { TimezoneDisplay } from '@/components/TimezoneDisplay';
import { TicketQRCode } from '@/components/TicketQRCode';

function EventCard({ eventData }: { eventData: UserRSVPWithEvent | UserTicketWithEvent }) {
  const isTicket = 'isTicket' in eventData && eventData.isTicket;
  const event = eventData.event;
  const eventTitle = eventData.eventTitle;
  const location = event.tags.find((tag) => tag[0] === "location")?.[1];
  const imageUrl = event.tags.find((tag) => tag[0] === "image")?.[1];
  const startTime = event.tags.find((tag) => tag[0] === "start")?.[1];
  const eventIdentifier = createEventIdentifier(event);
  
  return (
    <Card className="h-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 overflow-hidden rounded-none sm:rounded-3xl border-2 border-transparent hover:border-primary/20 group mb-4">
      <Link to={`/event/${eventIdentifier}`} className="block">
        <div className="aspect-video w-full overflow-hidden relative">
          <img
            src={imageUrl || "/default-calendar.png"}
            alt={eventTitle}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl line-clamp-2 group-hover:text-primary transition-colors duration-200">
            {eventTitle}
          </CardTitle>
          {startTime && (
            <div className="text-sm font-medium">
              <TimezoneDisplay event={event} showLocalTime={false} />
            </div>
          )}
                  <div className="flex items-center justify-between mb-2 mt-2">
                    {isTicket ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-500"
                      >
                        🎟️ Ticket {eventData.sequenceNumber && eventData.totalTickets ? `${eventData.sequenceNumber}/${eventData.totalTickets}` : 'Purchased'}
                      </Badge>
                    ) : (
              <Badge
                variant="outline"
                className={
                  !isTicket && 'status' in eventData && eventData.status === "accepted"
                    ? "bg-green-500/10 text-green-500"
                    : !isTicket && 'status' in eventData && eventData.status === "tentative"
                    ? "bg-yellow-500/10 text-yellow-500"
                    : "bg-red-500/10 text-red-500"
                }
              >
                {!isTicket && 'status' in eventData && eventData.status === "accepted"
                  ? "Going"
                  : !isTicket && 'status' in eventData && eventData.status === "tentative"
                  ? "Maybe"
                  : "Can't Go"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
            {event.content}
          </p>
          {location && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-xl">
              <span className="text-primary">📍</span>
              <span className="font-medium">{location}</span>
            </div>
          )}
          {isTicket && 'amount' in eventData && eventData.amount > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-2 rounded-xl border border-amber-200 dark:border-amber-800">
              <span className="text-amber-600 dark:text-amber-400">💰</span>
              <span className="font-medium text-amber-800 dark:text-amber-200">
                Paid {eventData.amount} sats
              </span>
            </div>
          )}
          {!isTicket && 'rsvp' in eventData && eventData.rsvp.content && (
            <p className="text-muted-foreground text-sm mt-2">
              Your note: {eventData.rsvp.content}
            </p>
          )}
        </CardContent>
      </Link>
      
      {/* Show QR Code for purchased tickets - OUTSIDE the Link */}
      {isTicket && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          <TicketQRCode ticket={eventData as UserTicketWithEvent} />
        </div>
      )}
    </Card>
  );
        }

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="mb-4">
          <CardHeader>
            <div className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MyTickets() {
  const { user } = useCurrentUser();
  const [activeTab, setActiveTab] = useState("upcoming");
  const { data: rsvpData, isLoading, error } = useUserRSVPs();

  if (!user) {
    return (
      <div className="container px-0 sm:px-4 py-2 sm:py-6">
        <div className="px-3 sm:px-0 text-center">
          <div className="flex justify-center mb-2"><Ticket className="h-12 w-12 text-primary" /></div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mb-4">
            My Tickets
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mb-6">
            Please log in to view your event tickets and RSVPs.
          </p>
          <div className="flex justify-center">
            <LoginArea className="max-w-60" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container px-0 sm:px-4 py-2 sm:py-6 space-y-3 sm:space-y-6">
      <div className="px-3 sm:px-0">
        <div className="flex justify-center mb-2"><Ticket className="h-12 w-12 text-primary" /></div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mb-2 text-center">
          My Tickets
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground text-center">
          View your upcoming events and past event history
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex gap-2">
          <TabsTrigger value="upcoming" className="flex items-center gap-1"><Calendar className="h-4 w-4 text-primary" /> Upcoming</TabsTrigger>
          <TabsTrigger value="past" className="flex items-center gap-1"><History className="h-4 w-4 text-primary" /> Past</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          {isLoading ? (
            <LoadingSkeleton />
          ) : error ? (
            <Card className="p-8 text-center">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-2">
                  Error Loading Events
                </h3>
                <p className="text-muted-foreground">
                  There was an error loading your events. Please try again.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {rsvpData?.upcoming && rsvpData.upcoming.length > 0 ? (
                rsvpData.upcoming.map((eventData) => {
                  const isTicket = 'isTicket' in eventData && eventData.isTicket;
                  const key = isTicket ? (eventData as UserTicketWithEvent).zapReceipt.id : (eventData as UserRSVPWithEvent).rsvp.id;
                  return <EventCard key={key} eventData={eventData} />;
                })
              ) : (
                <Card className="p-8 text-center col-span-full">
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-2">
                      No Upcoming Events
                    </h3>
                    <p className="text-muted-foreground">
                      You haven't RSVPed to any upcoming events yet. Browse
                      events to find something interesting!
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          {isLoading ? (
            <LoadingSkeleton />
          ) : error ? (
            <Card className="p-8 text-center">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-2">
                  Error Loading Events
                </h3>
                <p className="text-muted-foreground">
                  There was an error loading your events. Please try again.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {rsvpData?.past && rsvpData.past.length > 0 ? (
                rsvpData.past.map((eventData) => {
                  const isTicket = 'isTicket' in eventData && eventData.isTicket;
                  const key = isTicket ? (eventData as UserTicketWithEvent).zapReceipt.id : (eventData as UserRSVPWithEvent).rsvp.id;
                  return <EventCard key={key} eventData={eventData} />;
                })
              ) : (
                <Card className="p-8 text-center col-span-full">
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-2">
                      No Past Events
                    </h3>
                    <p className="text-muted-foreground">
                      You haven't attended any events yet. Start exploring and
                      joining events!
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
