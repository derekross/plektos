import { useState, useEffect, useCallback } from "react";
import { nip19 } from "nostr-tools";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { TimePicker } from "@/components/ui/time-picker";
import { LocationSearch } from "@/components/LocationSearch";
import { ImageUpload } from "@/components/ImageUpload";
import { CategorySelector } from "@/components/CategorySelector";
import { PaidTicketForm } from "@/components/PaidTicketForm";
import { ParticipantManager } from "@/components/ParticipantManager";
import type { Participant } from "@/components/ParticipantSearch";
import { EventCategory } from "@/lib/eventCategories";
import { genUserName } from "@/lib/genUserName";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit } from "lucide-react";
import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting } from "@/lib/eventTypes";
import {
  getGroupedTimezoneOptions,
  createTimestampInTimezone,
} from "@/lib/eventTimezone";
import { encodeGeohash } from "@/lib/geolocation";

interface EditEventProps {
  event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting;
  onEventUpdated?: () => void;
}

export function EditEvent({ event, onEventUpdated }: EditEventProps) {
  const { user } = useCurrentUser();
  const { mutate: updateEvent } = useNostrPublish();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on mount and window resize
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);

    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // Extract current event data
  const getInitialFormData = useCallback(() => {
    const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "";
    const description = event.content || "";
    const location = event.tags.find((tag) => tag[0] === "location")?.[1] || "";
    const imageUrl = event.tags.find((tag) => tag[0] === "image")?.[1] || "";
    const startTime = event.tags.find((tag) => tag[0] === "start")?.[1] || "";
    const endTime = event.tags.find((tag) => tag[0] === "end")?.[1] || "";
    const categories = event.tags
      .filter((tag) => tag[0] === "t")
      .map((tag) => tag[1] as EventCategory);

    // Extract ticket information
    const price = event.tags.find((tag) => tag[0] === "price")?.[1];
    const lightningAddress = event.tags.find((tag) => tag[0] === "lud16")?.[1];
    const hasTicketInfo = !!(price && lightningAddress);

    // Extract participants from p tags
    const participants: Participant[] = event.tags
      .filter((tag) => tag[0] === "p")
      .map((tag) => {
        const pubkey = tag[1];
        const role = tag[3] || "attendee"; // Default role if not specified
        const npub = nip19.npubEncode(pubkey);
        return {
          pubkey,
          npub,
          displayName: genUserName(pubkey), // Will be updated by useAuthor hook if needed
          role,
        };
      });

    // Extract timezone (only for time-based events)
    const timezone =
      event.tags.find((tag) => tag[0] === "start_tzid")?.[1] ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Parse dates differently based on event kind
    let startDate = "";
    let endDate = "";
    let startTimeOfDay = "";
    let endTimeOfDay = "";

    if (event.kind === 31922) {
      // Date-based event: startTime and endTime are in YYYY-MM-DD format
      startDate = startTime;
      endDate = endTime;
    } else {
      // Time-based event: startTime and endTime are Unix timestamps
      // Parse them in the event's timezone, not the browser's timezone
      if (startTime) {
        const startDateTime = new Date(parseInt(startTime) * 1000);
        
        // Format the date and time in the event's timezone
        const dateTimeInEventTz = startDateTime.toLocaleString("en-CA", {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        
        // Parse the formatted string to extract date and time
        const [datePart, timePart] = dateTimeInEventTz.split(', ');
        startDate = datePart; // Already in YYYY-MM-DD format
        startTimeOfDay = timePart; // Already in HH:MM format
      }
      if (endTime) {
        const endDateTime = new Date(parseInt(endTime) * 1000);
        
        // Format the date and time in the event's timezone
        const dateTimeInEventTz = endDateTime.toLocaleString("en-CA", {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        
        // Parse the formatted string to extract date and time
        const [datePart, timePart] = dateTimeInEventTz.split(', ');
        endDate = datePart; // Already in YYYY-MM-DD format
        endTimeOfDay = timePart; // Already in HH:MM format
      }
    }

    return {
      title,
      description,
      location,
      locationDetails: {
        name: "",
        address: location,
        placeId: "",
        lat: 0,
        lng: 0,
      },
      startDate,
      startTime: startTimeOfDay,
      endDate,
      endTime: endTimeOfDay,
      imageUrl,
      categories,
      ticketInfo: {
        enabled: hasTicketInfo,
        price: price ? parseInt(price) : 0,
        lightningAddress: lightningAddress || "",
      },
      timezone,
      participants,
    };
  }, [event]);

  const [formData, setFormData] = useState(getInitialFormData());

  // Reset form data when event changes
  useEffect(() => {
    setFormData(getInitialFormData());
  }, [getInitialFormData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate required fields
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }

    if (!formData.startDate) {
      toast.error("Start date is required");
      return;
    }

    if (!formData.endDate) {
      toast.error("End date is required");
      return;
    }

    // Validate end date is after start date
    if (formData.endDate < formData.startDate) {
      toast.error("End date must be after start date");
      return;
    }

    setIsSubmitting(true);
    try {
      // Determine if this is a time-based event (preserve original kind)
      const eventKind = event.kind;

      // Format start and end timestamps based on event kind
      let startTimestamp: string;
      let endTimestamp: string | undefined;

      if (eventKind === 31923) {
        // For time-based events, use Unix timestamps with specific times
        if (formData.startTime) {
          startTimestamp = createTimestampInTimezone(
            formData.startDate,
            formData.startTime,
            formData.timezone
          ).toString();
        } else {
          startTimestamp = Math.floor(
            new Date(formData.startDate + "T00:00:00").getTime() / 1000
          ).toString();
        }

        if (formData.endTime) {
          endTimestamp = createTimestampInTimezone(
            formData.endDate,
            formData.endTime,
            formData.timezone
          ).toString();
        } else {
          endTimestamp = Math.floor(
            new Date(formData.endDate + "T00:00:00").getTime() / 1000
          ).toString();
        }
      } else {
        // For date-only events, use YYYY-MM-DD format as per NIP-52
        startTimestamp = formData.startDate;
        endTimestamp = formData.endDate;
      }

      // Get the original 'd' tag value to maintain the same identifier
      const originalDTag = event.tags.find((tag) => tag[0] === "d")?.[1];
      if (!originalDTag) {
        toast.error("Cannot find event identifier");
        return;
      }

      const tags = [
        ["d", originalDTag], // Keep the same identifier for replacement
        ["title", formData.title],
        ["description", formData.description],
        ["location", formData.location],
      ];

      // Add location details if available
      if (formData.locationDetails.lat && formData.locationDetails.lng) {
        // Encode coordinates as geohash (NIP-52)
        const geohash = encodeGeohash(
          formData.locationDetails.lat,
          formData.locationDetails.lng,
          9 // 9 characters gives ~4.8m precision
        );
        tags.push(["g", geohash]);
        
        // Also store raw coordinates for backwards compatibility
        tags.push(["lat", formData.locationDetails.lat.toString()]);
        tags.push(["lon", formData.locationDetails.lng.toString()]);
        
        if (formData.locationDetails.placeId) {
          tags.push(["place_id", formData.locationDetails.placeId]);
        }
      }

      // Add start and end timestamps
      tags.push(["start", startTimestamp]);
      if (endTimestamp) {
        tags.push(["end", endTimestamp]);
      }

      // Add timezone tags only for time-based events (kind 31923)
      if (eventKind === 31923) {
        tags.push(["start_tzid", formData.timezone]);
        if (endTimestamp) {
          tags.push(["end_tzid", formData.timezone]);
        }
      }

      // Add image URL if provided
      if (formData.imageUrl) {
        tags.push(["image", formData.imageUrl]);
      }

      // Add categories as 't' tags if provided
      if (formData.categories.length > 0) {
        for (const category of formData.categories) {
          tags.push(["t", category]);
        }
      }

      // Add participants as p tags (per NIP-52)
      if (formData.participants.length > 0) {
        for (const participant of formData.participants) {
          // Format: ["p", pubkey, optional_relay_url, role]
          tags.push(["p", participant.pubkey, "", participant.role]);
        }
      }

      // Add ticket information if enabled
      if (formData.ticketInfo.enabled) {
        tags.push(
          ["price", formData.ticketInfo.price.toString()],
          ["lud16", formData.ticketInfo.lightningAddress]
        );
      }

      updateEvent({
        kind: eventKind,
        content: formData.description,
        tags,
      }, {
        onSuccess: (updatedEvent) => {
          toast.success("Event updated successfully! Changes should appear immediately.");
          console.log("Event updated with ID:", updatedEvent.id);
          setOpen(false);

          // Call the callback to trigger data refresh
          if (onEventUpdated) {
            onEventUpdated();
          }
        },
        onError: (error) => {
          toast.error("Failed to update event");
          console.error("Error updating event:", error);
        }
      });
    } catch (error) {
      toast.error("Failed to update event");
      console.error("Error updating event:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || user.pubkey !== event.pubkey) {
    return null;
  }

  // Only show edit button for NIP-52 calendar events (31922 and 31923)
  // Live events (30311) cannot be edited with this component
  if (event.kind !== 31922 && event.kind !== 31923) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Edit className="h-4 w-4" />
          Edit Event
        </Button>
      </DialogTrigger>
      <DialogContent
        className="mobile-dialog-content overflow-y-auto p-3 sm:p-6"
        onOpenAutoFocus={(e) => {
          // Prevent auto-focus on mobile to avoid virtual keyboard issues
          if (isMobile) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="pb-2 sm:pb-4">
          <DialogTitle className="text-lg sm:text-xl">Edit Event</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 sm:space-y-6 max-w-full overflow-hidden"
        >
          <div className="w-full max-w-full">
            <Label htmlFor="title" className="text-sm">
              Event Title
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              required
              className="text-sm w-full max-w-full"
            />
          </div>

          <div className="w-full max-w-full">
            <Label htmlFor="description" className="text-sm">
              Description
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              required
              className="text-sm min-h-[100px] w-full max-w-full resize-none"
            />
          </div>

          <LocationSearch
            value={formData.location}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, location: value }))
            }
            onLocationSelect={(location) =>
              setFormData((prev) => ({
                ...prev,
                location: location.address,
                locationDetails: location,
              }))
            }
          />

          <ImageUpload
            value={formData.imageUrl}
            onChange={(url) => {
              setFormData((prev) => ({ ...prev, imageUrl: url }));
            }}
          />

          <CategorySelector
            selectedCategories={formData.categories}
            onCategoriesChange={(categories) =>
              setFormData((prev) => ({ ...prev, categories }))
            }
          />

          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-sm font-medium">
                  Start Date
                </Label>
                <Calendar
                  id="startDate"
                  mode="single"
                  selected={
                    formData.startDate
                      ? new Date(formData.startDate + "T12:00:00Z")
                      : undefined
                  }
                  onSelect={(date) => {
                    if (date) {
                      // Create date in UTC noon to avoid timezone issues
                      const selectedDate = new Date(
                        Date.UTC(
                          date.getFullYear(),
                          date.getMonth(),
                          date.getDate(),
                          12,
                          0,
                          0,
                          0
                        )
                      );
                      setFormData((prev) => ({
                        ...prev,
                        startDate: selectedDate.toISOString().split("T")[0],
                      }));
                    }
                  }}
                  disabled={(date) => {
                    const today = new Date();
                    today.setUTCHours(0, 0, 0, 0);
                    return date < today;
                  }}
                  className="rounded-md border w-full mx-auto max-w-[280px] sm:max-w-none"
                  classNames={{
                    months:
                      "flex w-full flex-col sm:flex-row space-y-0 sm:space-y-0",
                    month: "space-y-2",
                    caption: "flex justify-center p-1 relative items-center",
                    caption_label: "text-xs sm:text-sm font-medium",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell:
                      "text-muted-foreground rounded-md w-7 sm:w-9 font-normal text-[0.7rem] sm:text-[0.8rem]",
                    row: "flex w-full mt-1 sm:mt-2",
                    cell: "text-center text-xs sm:text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "h-7 w-7 sm:h-9 sm:w-9 p-0 font-normal aria-selected:opacity-100 text-xs sm:text-sm",
                    day_selected:
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                    day_hidden: "invisible",
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-sm font-medium">
                  End Date
                </Label>
                <Calendar
                  id="endDate"
                  mode="single"
                  selected={
                    formData.endDate
                      ? new Date(formData.endDate + "T12:00:00Z")
                      : undefined
                  }
                  onSelect={(date) => {
                    if (date) {
                      // Create date in UTC noon to avoid timezone issues
                      const selectedDate = new Date(
                        Date.UTC(
                          date.getFullYear(),
                          date.getMonth(),
                          date.getDate(),
                          12,
                          0,
                          0,
                          0
                        )
                      );
                      setFormData((prev) => ({
                        ...prev,
                        endDate: selectedDate.toISOString().split("T")[0],
                      }));
                    }
                  }}
                  disabled={(date) => {
                    const startDate = formData.startDate
                      ? new Date(formData.startDate + "T12:00:00Z")
                      : new Date();
                    startDate.setUTCHours(0, 0, 0, 0);
                    return date < startDate;
                  }}
                  className="rounded-md border w-full mx-auto max-w-[280px] sm:max-w-none"
                  classNames={{
                    months:
                      "flex w-full flex-col sm:flex-row space-y-0 sm:space-y-0",
                    month: "space-y-2",
                    caption: "flex justify-center p-1 relative items-center",
                    caption_label: "text-xs sm:text-sm font-medium",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell:
                      "text-muted-foreground rounded-md w-7 sm:w-9 font-normal text-[0.7rem] sm:text-[0.8rem]",
                    row: "flex w-full mt-1 sm:mt-2",
                    cell: "text-center text-xs sm:text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "h-7 w-7 sm:h-9 sm:w-9 p-0 font-normal aria-selected:opacity-100 text-xs sm:text-sm",
                    day_selected:
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                    day_hidden: "invisible",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Only show time fields for time-based events or if times are already set */}
          {(event.kind === 31923 || formData.startTime || formData.endTime) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Start Time {event.kind === 31922 && "(Optional)"}</Label>
                <TimePicker
                  value={formData.startTime}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, startTime: value }))
                  }
                />
              </div>
              <div>
                <Label>End Time {event.kind === 31922 && "(Optional)"}</Label>
                <TimePicker
                  value={formData.endTime}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, endTime: value }))
                  }
                />
              </div>
            </div>
          )}

          {/* Only show timezone for time-based events */}
          {event.kind === 31923 && (
            <div>
              <Label className="text-sm">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, timezone: value }))
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  {getGroupedTimezoneOptions().map((group) => (
                    <div key={group.group}>
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                        {group.group}
                      </div>
                      {group.options.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="text-sm"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <ParticipantManager
            participants={formData.participants}
            onChange={(participants) =>
              setFormData((prev) => ({ ...prev, participants }))
            }
          />

          <PaidTicketForm
            initialTicketInfo={formData.ticketInfo}
            onTicketInfoChange={(ticketInfo) =>
              setFormData((prev) => ({ ...prev, ticketInfo }))
            }
          />

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
              className="w-full"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Updating..." : "Update Event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
