/**
 * Plektos writes the SAME kind-33302 document Armada does — that shared list is
 * what makes a private event openable in both apps. The corollary is that a
 * defect here damages the user's Armada memberships, so these tests pin the two
 * properties that protect them.
 */
import { describe, expect, it } from "vitest";

import {
  addToList,
  removeFromList,
  liveEntries,
  EMPTY_COMMUNITY_LIST,
  type CommunityList,
  type CommunityListEntry,
} from "@/concord/lib/communityList";
import { defragment, fragment } from "@/concord/lib/listFrag";

/** An entry carrying fields this app does not model — as Armada's would. */
function entryWithUnknowns(id: string, extra: Record<string, unknown>): CommunityListEntry {
  const jm = {
    community_id: id,
    owner: "a".repeat(64),
    owner_salt: "b".repeat(64),
    community_root: "c".repeat(64),
    root_epoch: 0,
    control_pk: "d".repeat(64),
    channels: [
      {
        id: "e".repeat(64),
        key: "f".repeat(64),
        epoch: 0,
        name: "general",
        // Armada rides `priors` here; dropping it takes a channel's
        // pre-rotation history dark.
        priors: [{ key: "0".repeat(64), epoch: 0 }],
      },
    ],
    relays: ["wss://relay.example"],
    name: "From Armada",
    ...extra,
  };
  return { community_id: id, seed: jm, current: jm, added_at: 1 };
}

describe("key list round trip", () => {
  it("preserves fields this app does not model", () => {
    const id = "1".repeat(64);
    const list = addToList(
      EMPTY_COMMUNITY_LIST,
      entryWithUnknowns(id, {
        // Neither of these exists in Plektos's own types.
        armada_only_setting: { nested: ["value", 1, true] },
        refounder: "npub1example",
      }),
    );

    const round = defragment(fragment(list));
    const entry = liveEntries(round).find((e) => e.community_id === id);

    expect(entry, "the entry must survive").toBeTruthy();
    expect(entry!.current.armada_only_setting).toEqual({ nested: ["value", 1, true] });
    expect(entry!.current.refounder).toBe("npub1example");
    expect(entry!.current.control_pk).toBe("d".repeat(64));
    expect(entry!.current.channels[0].priors).toEqual([{ key: "0".repeat(64), epoch: 0 }]);
  });

  it("keeps every membership when a new one is appended", () => {
    let list: CommunityList = EMPTY_COMMUNITY_LIST;
    const ids = ["1", "2", "3"].map((n) => n.repeat(64));
    for (const id of ids) list = addToList(list, entryWithUnknowns(id, {}));

    // What creating a private event does to an existing Armada list.
    const withNew = addToList(list, entryWithUnknowns("9".repeat(64), {}));
    const round = defragment(fragment(withNew));

    expect(liveEntries(round).map((e) => e.community_id).sort()).toEqual(
      [...ids, "9".repeat(64)].sort(),
    );
  });

  it("does not resurrect a removed entry through the round trip", () => {
    // The failure mode a stale fragment index causes on relays: an entry the
    // user removed reappears because a fossil fragment is unioned back in.
    let list: CommunityList = EMPTY_COMMUNITY_LIST;
    const keep = "1".repeat(64);
    const drop = "2".repeat(64);
    list = addToList(list, entryWithUnknowns(keep, {}));
    list = addToList(list, entryWithUnknowns(drop, {}));
    list = removeFromList(list, drop, Date.now());

    const round = defragment(fragment(list));
    expect(liveEntries(round).map((e) => e.community_id)).toEqual([keep]);
  });
});
