/**
 * What "private" actually means for this event.
 *
 * The principle here is to say what is true, not what is comforting. Guests are
 * deciding whether to put a home address in front of software, and a vague
 * reassurance is worse than a plain limitation.
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Community } from "@/concord/lib/types";
import { totalHeadcount, type RsvpTally } from "@/lib/private/calendar";

export function PrivacySheet({
  community,
  tally,
  open,
  onOpenChange,
}: {
  community: Community;
  tally: RsvpTally;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>🔒 Who can see this party</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4 text-sm">
          <section>
            <h4 className="mb-1 font-semibold">Who</h4>
            <p className="text-muted-foreground">
              {totalHeadcount(tally)}{" "}
              {totalHeadcount(tally) === 1 ? "person who has" : "people who have"} replied, plus
              anyone the host has given the link to.
            </p>
          </section>

          <section>
            <h4 className="mb-1 font-semibold">Encrypted</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>✅ The title, description and address</li>
              <li>✅ Who's going, and how many they're bringing</li>
              <li>✅ Anything posted inside the party</li>
            </ul>
          </section>

          <section>
            <h4 className="mb-1 font-semibold">Not private</h4>
            {/* Not hidden behind a "learn more" — these are the real limits. */}
            <ul className="space-y-1 text-muted-foreground">
              <li>
                Relays can see that a group of accounts is exchanging messages, roughly when,
                and how much. They can guess a party is happening; they cannot read it.
              </li>
              <li>
                Your invite link is only as private as wherever you send it. Anyone who has it
                can get in.
              </li>
              <li>
                Removing someone stops them getting new invites. It does not take back what
                they've already seen, and screenshots aren't encrypted.
              </li>
              <li>The cover image is stored unencrypted.</li>
            </ul>
          </section>

          <p className="text-xs text-muted-foreground">
            Stored on: {community.relays.join(", ") || "the app's default relays"}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
