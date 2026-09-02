/**
 * Host controls for a private party: edit, and delete.
 *
 * The delete copy is deliberately not reassuring. Concord has no revocation:
 * a tombstone hides the party in clients that read the stream, but every guest
 * still holds the channel key and the wraps stay on relays. Saying "deleted"
 * without saying that would be a lie the host might act on.
 */
import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WhenPicker, type WhenValue } from "@/components/WhenPicker";
import { usePrivateEventActions } from "@/hooks/private/usePrivateEventActions";
import { KIND_CALENDAR_TIME } from "@/concord/lib/kinds";
import type { CalendarEvent } from "@/lib/private/calendar";

/** Seed the form from the event as published. */
function toWhen(event: CalendarEvent): WhenValue {
  const iso = (secs: string) => new Date(Number(secs) * 1000).toISOString().split("T")[0];
  const clock = (secs: string) =>
    new Date(Number(secs) * 1000).toTimeString().slice(0, 5);
  const timed = event.kind === KIND_CALENDAR_TIME;
  return {
    startDate: timed ? iso(event.start) : event.start,
    startTime: timed ? clock(event.start) : "",
    endDate: event.end ? (timed ? iso(event.end) : event.end) : timed ? iso(event.start) : event.start,
    endTime: event.end && timed ? clock(event.end) : "",
    timezone: event.startTzid || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function EditPrivateEvent({
  channelId,
  event,
  onDeleted,
}: {
  channelId: string;
  event: CalendarEvent;
  onDeleted: () => void;
}) {
  const { editEvent, deleteEvent } = usePrivateEventActions(channelId);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [location, setLocation] = useState(event.location ?? "");
  const [when, setWhen] = useState<WhenValue>(() => toWhen(event));

  const save = async () => {
    if (!title.trim()) return toast.error("Give the party a name");
    setSaving(true);
    try {
      const timed = Boolean(when.startTime);
      const start = timed
        ? String(Math.floor(new Date(`${when.startDate}T${when.startTime}`).getTime() / 1000))
        : when.startDate;
      const end = when.endTime
        ? String(Math.floor(new Date(`${when.endDate}T${when.endTime}`).getTime() / 1000))
        : when.endDate && when.endDate !== when.startDate
          ? when.endDate
          : undefined;

      await editEvent(event, {
        title: title.trim(),
        description,
        location: location.trim() || undefined,
        start,
        end,
        ...(timed ? { startTzid: when.timezone } : {}),
        // Carried forward explicitly: these live in tags, and a rebuild that
        // omits them would quietly strip the cover and the chip-in details.
        imageEnc: event.imageEnc,
        amount: event.amount,
        cashapp: event.cashapp,
        venmo: event.venmo,
        lightning: event.lightning,
      });
      toast.success("Party updated");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save those changes");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteEvent(event);
      toast.success("Party deleted");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the party");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1 rounded-2xl" onClick={() => setOpen(true)}>
        <Pencil className="mr-2 size-4" /> Edit party
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="rounded-2xl text-destructive" disabled={deleting}>
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this party?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>It disappears from your list and from your guests' apps.</p>
                <p>
                  It is not unsent. Guests still hold the key, and anything already on relays
                  stays there — someone who kept a copy can still read it.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete party
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit party</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-24 rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Where</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <WhenPicker value={when} onChange={(patch) => setWhen((p) => ({ ...p, ...patch }))} />
            <Button className="w-full bg-party-gradient" disabled={saving} onClick={save}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Guests keep their RSVPs — editing republishes the party, it doesn't restart it.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
