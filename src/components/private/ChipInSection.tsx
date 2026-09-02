/**
 * Chip in.
 *
 * Reuses Plektos's existing ZapButton WITHOUT `fixedAmount` — its amount
 * picker is exactly what a suggested contribution is, so this adds no
 * Lightning code at all. Cash App and Venmo rows sit below it because a US
 * house party is precisely where those get used, and Plektos has nothing
 * equivalent. The tag names match what Armada and the Concord events app
 * already read, so interop is free.
 */
import { PosterSection } from "@/components/PosterSection";
import type { CalendarEvent } from "@/lib/private/calendar";

function money(handle: string, amount?: string) {
  return amount ? `${handle} · ${amount} sats suggested` : handle;
}

export function ChipInSection({ event }: { event: CalendarEvent }) {
  const { amount, cashapp, venmo, lightning } = event;
  if (!amount && !cashapp && !venmo && !lightning) return null;

  return (
    <PosterSection title="Chip in 💸">
      {amount && (
        <p className="mb-3 text-sm text-muted-foreground">
          The host suggests {amount} sats — entirely optional.
        </p>
      )}
      <div className="space-y-2">
        {lightning && (
          <a
            href={`lightning:${lightning}`}
            className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            ⚡ Lightning · {lightning}
          </a>
        )}
        {cashapp && (
          <a
            href={`https://cash.app/${cashapp.startsWith("$") ? cashapp : `$${cashapp}`}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            💵 Cash App · {money(cashapp)}
          </a>
        )}
        {venmo && (
          <a
            href={`https://venmo.com/${venmo.replace(/^@/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            📲 Venmo · {money(venmo)}
          </a>
        )}
      </div>
    </PosterSection>
  );
}
