/**
 * Do RSVPs survive an edit?
 *
 * This is the one property that makes editing a private event safe, and it
 * fails invisibly: an edit republishes under the same `d`, which mints a NEW
 * rumor id, and every vote cast beforehand `e`-tags the old one. Without
 * re-pointing the party still renders — with an empty guest list.
 */
import { describe, expect, it } from "vitest";
import { getEventHash } from "nostr-tools/pure";

import { KIND_CALENDAR_RSVP, KIND_CALENDAR_TIME } from "@/concord/lib/kinds";
import type { OpenedEvent } from "@/concord/lib/stream";
import { buildCalendarTags, foldCalendarRumors, tallyRsvps, votesByEvent } from "@/lib/private/calendar";

const HOST = "a".repeat(64);
const GUEST = "b".repeat(64);
const D = "party-1";

function opened(over: {
  kind: number;
  author: string;
  tags: string[][];
  ms: number;
  content?: string;
}): OpenedEvent {
  const base = {
    kind: over.kind,
    content: over.content ?? "",
    tags: over.tags,
    created_at: Math.floor(over.ms / 1000),
    pubkey: over.author,
  };
  return {
    ...base,
    rumorId: getEventHash(base as never),
    author: over.author,
    ms: over.ms,
    createdAt: base.created_at,
    wrapId: "w",
    streamPk: "s",
    sealKind: 20013,
    seal: {} as never,
  } as OpenedEvent;
}

const calendar = (title: string, ms: number) =>
  opened({
    kind: KIND_CALENDAR_TIME,
    author: HOST,
    ms,
    tags: buildCalendarTags({
      identifier: D,
      kind: KIND_CALENDAR_TIME,
      title,
      start: "1800000000",
    }),
  });

const rsvp = (targetRumorId: string, ms: number) =>
  opened({
    kind: KIND_CALENDAR_RSVP,
    author: GUEST,
    ms,
    tags: [
      ["e", targetRumorId],
      ["status", "accepted"],
      ["k", String(KIND_CALENDAR_TIME)],
      ["p", HOST],
    ],
  });

describe("RSVPs across an edit", () => {
  it("keeps a vote attached after the host edits the party", () => {
    const original = calendar("Rooftop Solstice", 1000);
    const vote = rsvp(original.rumorId, 2000);
    // Same `d`, later timestamp, different title => a NEW rumor id.
    const edited = calendar("Rooftop Solstice (moved indoors)", 3000);
    expect(edited.rumorId).not.toBe(original.rumorId);

    const stream = [original, vote, edited];
    const folded = foldCalendarRumors(stream);

    // The fold keeps one event — the edit — per (author, d).
    expect(folded).toHaveLength(1);
    expect(folded[0].title).toBe("Rooftop Solstice (moved indoors)");
    expect(folded[0].rumorId).toBe(edited.rumorId);

    const votes = votesByEvent(stream, folded);
    const tally = tallyRsvps(votes.get(folded[0].rumorId) ?? [], undefined);
    expect(tally.accepted.map((e) => e.pubkey)).toEqual([GUEST]);
  });

  it("survives two consecutive edits", () => {
    const v1 = calendar("First", 1000);
    const vote = rsvp(v1.rumorId, 1500);
    const v2 = calendar("Second", 2000);
    const v3 = calendar("Third", 3000);

    const stream = [v1, vote, v2, v3];
    const folded = foldCalendarRumors(stream);
    const votes = votesByEvent(stream, folded);
    expect(folded[0].title).toBe("Third");
    expect(tallyRsvps(votes.get(folded[0].rumorId) ?? [], undefined).accepted).toHaveLength(1);
  });

  it("does not move a vote aimed at a different party", () => {
    const ours = calendar("Ours", 1000);
    const stray = rsvp("f".repeat(64), 2000);
    const edited = calendar("Ours, edited", 3000);

    const stream = [ours, stray, edited];
    const folded = foldCalendarRumors(stream);
    const votes = votesByEvent(stream, folded);
    // The unknown target is left where it was, not swept onto our event.
    expect(votes.get(folded[0].rumorId) ?? []).toHaveLength(0);
  });
});
