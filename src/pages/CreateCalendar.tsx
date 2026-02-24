import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/ImageUpload";
import { toast } from "sonner";
import { CalendarDays, Rocket, Target, FileText, Hash, MapPin, Filter } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function CreateCalendar() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutate: createEvent } = useNostrPublish();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    imageUrl: "",
    hashtags: "",
    location: "",
    matchType: "any" as "any" | "all"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.title.trim()) {
      toast.error("Calendar Name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const uniqueId = formData.title.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();

      const tags = [
        ["d", uniqueId], // Unique identifier representing the Calendar
        ["title", formData.title]
      ];

      if (formData.imageUrl) {
        tags.push(["image", formData.imageUrl]);
      }

      // Add auto-include filters
      if (formData.hashtags) {
        const parsedHashtags = formData.hashtags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
        parsedHashtags.forEach(tag => {
          // Remove # if user added it manually
          const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
          tags.push(["t", cleanTag]);
        });
      }

      if (formData.location) {
        const parsedLocations = formData.location.split("+").map(loc => loc.trim()).filter(Boolean);
        parsedLocations.forEach(loc => {
          tags.push(["location", loc]);
        });
      }

      if (formData.hashtags || formData.location.trim()) {
        tags.push(["match_type", formData.matchType]);
      }

      createEvent({
        kind: 31924,
        content: formData.description, // Calendar description is stored in content for 31924
        tags,
      }, {
        onSuccess: () => {
          // Invalidate calendar caches so it shows up immediately
          queryClient.invalidateQueries({ queryKey: ['calendars'] });
          // Go to user's profile to see the new calendar in their list
          const npub = import("nostr-tools").then(({ nip19 }) => {
            navigate(`/profile/${nip19.npubEncode(user.pubkey)}`);
          });
        },
        onError: (error) => {
          console.error("Error creating calendar:", error);
          toast.error("Failed to create calendar");
        }
      });

    } catch (error) {
      toast.error("An unexpected error occurred");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="container px-0 sm:px-4 py-2 sm:py-6">
        <div className="px-3 sm:px-0 text-center space-y-6 py-12">
          <div className="text-6xl">🗓️</div>
          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Create a Group Calendar
            </h1>
            <p className="text-lg text-muted-foreground">
              Please log in to organize events for your community.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container px-0 sm:px-4 py-2 sm:py-6 space-y-6 sm:space-y-8">
      <div className="px-3 sm:px-0 text-center space-y-4">
        <div className="flex justify-center"><CalendarDays className="h-12 w-12 text-primary" /></div>
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Create a Group Calendar
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Make a dedicated feed for your community or meetup group
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
        <div className="space-y-3">
          <Label htmlFor="title" className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Calendar Name
          </Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="e.g. Austin Bitcoin Meetup"
            className="text-lg py-3 rounded-2xl border-2 focus:border-primary transition-all duration-200"
            required
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="description" className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Description
          </Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="What kind of events belong in this calendar?"
            className="min-h-32 rounded-2xl border-2 focus:border-primary transition-all duration-200 resize-none"
            required
          />
        </div>

        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <h3 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Smart Filters (Optional)
            </h3>
            <p className="text-muted-foreground">
              Automatically pull events into this calendar if they match these criteria. No manual approval needed!
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="hashtags" className="text-lg font-semibold flex items-center gap-2">
                <Hash className="h-5 w-5 text-primary" /> Auto-Include Hashtags
              </Label>
              <Input
                id="hashtags"
                value={formData.hashtags}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, hashtags: e.target.value }))
                }
                placeholder="e.g. austin, bitcoin, meetup"
                className="text-lg py-3 rounded-2xl border-2 focus:border-primary transition-all duration-200"
              />
              <p className="text-xs text-muted-foreground">Comma-separated tags</p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="location" className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" /> Auto-Include Location
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, location: e.target.value }))
                }
                placeholder="e.g. Austin, TX + Lexington, KY"
                className="text-lg py-3 rounded-2xl border-2 focus:border-primary transition-all duration-200"
              />
              <p className="text-xs text-muted-foreground">Separate multiple locations with +</p>
            </div>

            {(formData.hashtags || formData.location) && (
              <div className="col-span-1 md:col-span-2 space-y-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border">
                  <div className="space-y-1">
                    <Label htmlFor="match-type" className="text-base font-semibold flex items-center gap-2">
                      <Filter className="h-4 w-4 text-primary" /> Filter Logic
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {formData.matchType === 'any'
                        ? 'Include events that match ANY of these tags or locations (OR)'
                        : 'Include events that must match ALL of these tags and locations (AND)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${formData.matchType === 'any' ? 'text-foreground' : 'text-muted-foreground'}`}>ANY</span>
                    <Switch
                      id="match-type"
                      checked={formData.matchType === 'all'}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, matchType: checked ? 'all' : 'any' }))
                      }
                    />
                    <span className={`text-sm font-medium ${formData.matchType === 'all' ? 'text-foreground' : 'text-muted-foreground'}`}>ALL</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <ImageUpload
          value={formData.imageUrl}
          onChange={(url) => setFormData((prev) => ({ ...prev, imageUrl: url }))}
        />

        <div className="flex justify-center pt-6">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="px-12 py-4 text-lg font-semibold rounded-2xl bg-party-gradient hover:opacity-90 transition-all duration-200 hover:scale-105 shadow-lg"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating Calendar...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" /> Create Calendar
              </div>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
