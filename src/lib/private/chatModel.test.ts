/**
 * Reactions and inline quotes, per CORD-03 §2.1 / §2.3.
 *
 * Both fail quietly: a reaction counted twice looks like two people agreeing,
 * and a quote that cites the wrong id renders as a message with no quoted card
 * rather than an error.
 */
import { describe, expect, it } from "vitest";
import { getEventHash } from "nostr-tools/pure";

import { KIND_DELETE, KIND_MESSAGE, KIND_REACTION } from "@/concord/lib/kinds";
import type { OpenedEvent } from "@/concord/lib/stream";
import { filterDeleted } from "@/lib/private/deletes";

const A = "a".repeat(64);
const B = "b".repeat(64);

function rumor(kind: number, author: string, content: string, tags: string[][], ms: number): OpenedEvent {
  const base = { kind, content, tags, created_at: Math.floor(ms / 1000), pubkey: author };
  return {
    ...base,
    rumorId: getEventHash(base as never),
    author,
    ms,
    createdAt: base.created_at,
    wrapId: "w",
    streamPk: "s",
    sealKind: 20013,
    seal: {} as never,
  } as OpenedEvent;
}

/**
 * The aggregation under test, kept in lockstep with usePrivateEventChat's
 * memo. Pure so the rules can be exercised without a React tree.
 */
function aggregate(opened: OpenedEvent[], self?: string) {
  const byId = new Map(opened.filter((e) => e.kind === KIND_MESSAGE).map((e) => [e.rumorId, e]));
  const reactions = new Map<string, Map<string, Map<string, string>>>();
  for (const ev of opened) {
    if (ev.kind !== KIND_REACTION) continue;
    const target = ev.tags.find((t) => t[0] === "e")?.[1];
    const emoji = ev.content.trim();
    if (!target || !emoji) continue;
    const t = reactions.get(target) ?? new Map();
    const e = t.get(emoji) ?? new Map<string, string>();
    e.set(ev.author, ev.rumorId);
    t.set(emoji, e);
    reactions.set(target, t);
  }
  return [...byId.values()].map((ev) => {
    const q = ev.tags.find((t) => t[0] === "q")?.[1];
    const quoted = q ? byId.get(q) : undefined;
    return {
      id: ev.rumorId,
      quote: quoted ? { id: quoted.rumorId, content: quoted.content } : undefined,
      reactions: [...(reactions.get(ev.rumorId)?.entries() ?? [])].map(([emoji, by]) => ({
        emoji,
        count: by.size,
        mine: self ? by.get(self) : undefined,
      })),
    };
  });
}

describe("reactions", () => {
  it("counts one per author per emoji, however many times they send it", () => {
    const msg = rumor(KIND_MESSAGE, A, "hi", [], 1000);
    const stream = [
      msg,
      rumor(KIND_REACTION, B, "🔥", [["e", msg.rumorId], ["p", A], ["k", "9"]], 2000),
      // Same author, same emoji, later: the same fact restated, not a second vote.
      rumor(KIND_REACTION, B, "🔥", [["e", msg.rumorId], ["p", A], ["k", "9"]], 3000),
    ];
    const [out] = aggregate(stream);
    expect(out.reactions).toEqual([{ emoji: "🔥", count: 1, mine: undefined }]);
  });

  it("counts distinct authors separately and surfaces the viewer's own", () => {
    const msg = rumor(KIND_MESSAGE, A, "hi", [], 1000);
    const stream = [
      msg,
      rumor(KIND_REACTION, A, "🎉", [["e", msg.rumorId], ["p", A], ["k", "9"]], 2000),
      rumor(KIND_REACTION, B, "🎉", [["e", msg.rumorId], ["p", A], ["k", "9"]], 2100),
    ];
    const [out] = aggregate(stream, B);
    expect(out.reactions[0].count).toBe(2);
    expect(out.reactions[0].mine).toBeTruthy();
  });

  it("un-reacting deletes only the viewer's own reaction", () => {
    const msg = rumor(KIND_MESSAGE, A, "hi", [], 1000);
    const mine = rumor(KIND_REACTION, B, "🔥", [["e", msg.rumorId], ["p", A], ["k", "9"]], 2000);
    const theirs = rumor(KIND_REACTION, A, "🔥", [["e", msg.rumorId], ["p", A], ["k", "9"]], 2100);
    // A kind 5 from B over B's own reaction — accepted because the author matches.
    const undo = rumor(KIND_DELETE, B, "", [["e", mine.rumorId]], 3000);

    const [out] = aggregate(filterDeleted([msg, mine, theirs, undo]), B);
    expect(out.reactions[0].count).toBe(1);
    expect(out.reactions[0].mine).toBeUndefined();
  });

  it("ignores a delete aimed at someone else's reaction", () => {
    const msg = rumor(KIND_MESSAGE, A, "hi", [], 1000);
    const theirs = rumor(KIND_REACTION, A, "🔥", [["e", msg.rumorId], ["p", A], ["k", "9"]], 2000);
    const hostile = rumor(KIND_DELETE, B, "", [["e", theirs.rumorId]], 3000);

    const [out] = aggregate(filterDeleted([msg, theirs, hostile]));
    expect(out.reactions[0].count).toBe(1);
  });
});

describe("inline quotes", () => {
  it("resolves a `q` tag to the quoted message", () => {
    const quoted = rumor(KIND_MESSAGE, A, "bring ice", [], 1000);
    const reply = rumor(KIND_MESSAGE, B, "on it", [["q", quoted.rumorId, "", A]], 2000);

    const out = aggregate([quoted, reply]);
    expect(out.find((m) => m.id === reply.rumorId)?.quote?.content).toBe("bring ice");
  });

  it("renders plainly when the quoted message isn't in the stream", () => {
    // A quote whose target was deleted, or has not arrived yet, must degrade to
    // an ordinary message rather than break the row.
    const reply = rumor(KIND_MESSAGE, B, "on it", [["q", "f".repeat(64), "", A]], 2000);
    expect(aggregate([reply])[0].quote).toBeUndefined();
  });
});
