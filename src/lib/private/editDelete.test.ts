/**
 * Editing and deleting a private event.
 *
 * Both have a failure mode that looks like success: an edit that quietly
 * orphans every RSVP, and a "delete" the merge algebra hands straight back.
 */
import { describe, expect, it } from "vitest";

import { addToList, rehydrateCommunity, type CommunityList, type CommunityListEntry } from "@/concord/lib/communityList";
import { defragment, fragment } from "@/concord/lib/listFrag";
import { EMPTY_COMMUNITY_LIST, mergeCommunityLists } from "@/concord/lib/communityList";
import { dropChannel } from "@/hooks/private/usePrivateEventActions";
import { filterDeleted } from "@/lib/private/deletes";
import type { OpenedEvent } from "@/concord/lib/stream";
import { bytesToHex, communityIdOf, hex32 } from "@/concord/lib/derive";

const HOST = "a".repeat(64);
const GUEST = "b".repeat(64);

function rumor(over: Partial<OpenedEvent> & Pick<OpenedEvent, "rumorId" | "kind" | "author">): OpenedEvent {
  return {
    content: "",
    tags: [],
    ms: 1,
    createdAt: 1,
    wrapId: "w",
    streamPk: "s",
    sealKind: 20013,
    seal: {} as never,
    ...over,
  } as OpenedEvent;
}

describe("author-checked deletes", () => {
  it("honours a delete from the rumor's own author", () => {
    const opened = [
      rumor({ rumorId: "m1", kind: 9, author: HOST }),
      rumor({ rumorId: "d1", kind: 5, author: HOST, tags: [["e", "m1"]] }),
    ];
    expect(filterDeleted(opened)).toEqual([]);
  });

  it("ignores a delete from anyone else", () => {
    // Every guest holds the channel key, so every guest can publish a kind 5.
    // Trusting them would let one guest erase the host's event.
    const opened = [
      rumor({ rumorId: "m1", kind: 9, author: HOST }),
      rumor({ rumorId: "d1", kind: 5, author: GUEST, tags: [["e", "m1"]] }),
    ];
    expect(filterDeleted(opened).map((o) => o.rumorId)).toEqual(["m1"]);
  });

  it("strips the tombstones themselves", () => {
    const opened = [
      rumor({ rumorId: "m1", kind: 9, author: HOST }),
      rumor({ rumorId: "d1", kind: 5, author: GUEST, tags: [["e", "m1"]] }),
    ];
    expect(filterDeleted(opened).some((o) => o.kind === 5)).toBe(false);
  });
});

describe("dropping a party from the key list", () => {
  const CHAN = "c".repeat(64);
  const OTHER = "d".repeat(64);

  // community_id is a self-certifying commitment to (owner, salt) —
  // rehydrateCommunity verifies it and fails closed, so the fixture has to be
  // internally consistent rather than made up.
  const SALT = new Uint8Array(32).fill(7);
  const SALT_HEX = bytesToHex(SALT);
  const CID = bytesToHex(communityIdOf(hex32(HOST), SALT));

  const material = (channels: Array<{ id: string; key: string; epoch: number; name: string }>) => ({
    community_id: CID,
    owner: HOST,
    owner_salt: SALT_HEX,
    community_root: "c".repeat(64),
    root_epoch: 0,
    relays: ["wss://relay.example"],
    name: "Plektos Events",
    channels,
  });

  const seeded = (): CommunityList => {
    const jm = material([
      { id: CHAN, key: "1".repeat(64), epoch: 0, name: "Doomed party" },
      { id: OTHER, key: "2".repeat(64), epoch: 0, name: "Keeper" },
    ]);
    const entry: CommunityListEntry = { community_id: CID, seed: jm, current: jm, added_at: 1 };
    return addToList(EMPTY_COMMUNITY_LIST, entry);
  };

  it("removes only the named party", () => {
    const cut = dropChannel(seeded(), CID, CHAN, 0);
    const community = rehydrateCommunity(defragment(fragment(cut)).entries[0])!;
    expect(community.privateChannels.map((c) => c.name)).toEqual(["Keeper"]);
  });

  it("stays dropped when another copy of the list still has it", () => {
    // The merge algebra UNIONS channel keys, so simply deleting the entry
    // would be undone by any stale copy — another device, a lagging relay.
    // channel_cuts is a monotonic floor, so the union cannot resurrect it.
    const cut = dropChannel(seeded(), CID, CHAN, 0);
    const merged = mergeCommunityLists(cut, seeded());
    const community = rehydrateCommunity(defragment(fragment(merged)).entries[0])!;
    expect(community.privateChannels.map((c) => c.name)).toEqual(["Keeper"]);
  });
});
