/**
 * When the party is.
 *
 * Replaces two always-open inline calendars sitting side by side, each about a
 * screen tall, with separate time pickers and a timezone select below. That
 * layout had two problems beyond its size: an End Date field of equal weight
 * implies a one-day party needs one, and on a phone the second calendar was
 * most of a scroll away from the first.
 *
 * Here the common case — one day, maybe a start time — is the default and fits
 * in a row. An end date and time appear only when asked for, and the timezone
 * only once a time exists to be ambiguous about.
 */
import { useState } from "react";
import { CalendarIcon, Clock, Globe, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { getGroupedTimezoneOptions } from "@/lib/eventTimezone";

export interface WhenValue {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
}

/** `YYYY-MM-DD` ⇄ Date, anchored at UTC noon so no timezone shifts the day. */
function toDate(iso: string): Date | undefined {
  return iso ? new Date(`${iso}T12:00:00Z`) : undefined;
}
function toIso(date: Date): string {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12),
  )
    .toISOString()
    .split("T")[0];
}

function DateField({
  label,
  value,
  onChange,
  min,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start rounded-2xl border-2 py-6 text-left font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 size-4 shrink-0 text-primary" />
            <span className="truncate">
              {selected
                ? selected.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              onChange(toIso(date));
              // Close on pick: the calendar is the whole point of the popover,
              // and leaving it open hides the field you just filled in.
              setOpen(false);
            }}
            disabled={(date) => {
              const floor = min ? toDate(min)! : new Date();
              floor.setUTCHours(0, 0, 0, 0);
              return date < floor;
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function WhenPicker({
  value,
  onChange,
}: {
  value: WhenValue;
  onChange: (patch: Partial<WhenValue>) => void;
}) {
  const [showEnd, setShowEnd] = useState(
    Boolean(value.endDate && value.endDate !== value.startDate) || Boolean(value.endTime),
  );

  const hasTime = Boolean(value.startTime || value.endTime);

  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2 text-lg font-semibold">
        <CalendarIcon className="size-5 text-primary" /> When's the party?
      </Label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <DateField
          label="Date"
          value={value.startDate}
          placeholder="Pick a day"
          onChange={(startDate) =>
            onChange({
              startDate,
              // A single-day party is the common case, so the end follows the
              // start unless the host has deliberately opened the end field.
              ...(showEnd ? {} : { endDate: startDate }),
              ...(value.endDate && value.endDate < startDate ? { endDate: startDate } : {}),
            })
          }
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label className="text-sm text-muted-foreground">Start time (optional)</Label>
          <TimePicker
            value={value.startTime}
            onChange={(startTime) => onChange({ startTime })}
          />
        </div>
      </div>

      {showEnd ? (
        <div className="relative rounded-2xl border-2 border-dashed p-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="absolute right-1 top-1 size-7 p-0 text-muted-foreground"
            aria-label="Remove end date and time"
            onClick={() => {
              setShowEnd(false);
              onChange({ endDate: value.startDate, endTime: "" });
            }}
          >
            <X className="size-4" />
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <DateField
              label="Ends"
              value={value.endDate}
              min={value.startDate}
              placeholder="Same day"
              onChange={(endDate) => onChange({ endDate })}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label className="text-sm text-muted-foreground">End time</Label>
              <TimePicker value={value.endTime} onChange={(endTime) => onChange({ endTime })} />
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="rounded-2xl text-muted-foreground"
          onClick={() => {
            setShowEnd(true);
            if (!value.endDate) onChange({ endDate: value.startDate });
          }}
        >
          <Plus className="mr-1.5 size-4" /> Add an end time
        </Button>
      )}

      {/* Only meaningful once there is a clock time to be ambiguous about. */}
      {hasTime && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="size-4" /> Timezone
          </Label>
          <Select value={value.timezone} onValueChange={(timezone) => onChange({ timezone })}>
            <SelectTrigger className="rounded-2xl border-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[400px]">
              {getGroupedTimezoneOptions().map((group) => (
                <div key={group.group}>
                  <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                    {group.group}
                  </div>
                  {group.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.startDate && !hasTime && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-3.5" /> No start time — this will be an all-day party.
        </p>
      )}
    </div>
  );
}
