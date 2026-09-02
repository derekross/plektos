/**
 * The user's private events.
 *
 * These cannot appear anywhere the public feed looks — there is no plaintext
 * event to find, by construction — so this is the only place they surface.
 * Without it a host creates a party and then cannot get back to it.
 */
import { Link } from "react-router-dom";
import { CalendarDays, Lock } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrivateParties } from "@/hooks/private/usePrivateEvent";

export function PrivateEventList() {
  const { parties, isLoading } = usePrivateParties();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (parties.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CardContent className="pt-6">
          <Lock className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <h3 className="mb-2 text-lg font-semibold">No private parties yet</h3>
          <p className="text-muted-foreground">
            Throw one from the create screen, or open an invite link someone sent you.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {parties.map((p) => (
        <Link
          key={p.channelIdHex}
          to={`/private/${p.channelIdHex}`}
          className="glass rounded-2xl p-4 transition-transform hover:scale-[1.01]"
        >
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            <Lock className="size-3" aria-hidden /> Private
          </p>
          <h3 className="font-display text-lg font-semibold leading-tight">{p.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden />
            Open to see the details
          </p>
        </Link>
      ))}
    </div>
  );
}
