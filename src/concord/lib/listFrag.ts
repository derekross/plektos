/**
 * CORD-02 §8 fragmented Community List (kind 33302) — the wire layer.
 *
 * The List is addressable, one event per fragment at `d` = the fragment index,
 * so it shards past the ~64KB an event may be and a membership set has no cap.
 * {@link fragment} packs a list into as few fragments as fit; {@link defragment}
 * unions whatever fragments a reader holds.
 *
 * Three shape changes against the retired single-event form: every 32-byte
 * value is unpadded base64url at any depth; a snapshot embedded in an entry
 * drops the `community_id` it inherits; `seed` is absent whenever it equals
 * `current`.
 *
 * BYTE IDENTITY IS THE CONTRACT. Two devices holding identical state must
 * serialize identical bytes, or §8's canonical-bytes tie-break flaps between
 * them — and the reference implementation (Vector's `list_frag.rs`) already
 * pins those bytes: serde emits each struct's declared fields in order, then
 * its flattened unknown-field map in lexicographic key order, with unknown
 * VALUES re-emitted with sorted keys at every depth (serde_json's Map is a
 * BTreeMap). `JSON.stringify` can reproduce none of that on a plain object
 * (integer-like keys hoist first; foreign key order is preserved), so this
 * module hand-emits the known levels and serializes everything below them
 * through {@link canonicalJson}. Internally the list stays HEX everywhere —
 * only this module speaks base64url, so the merge algebra, rehydrate and every
 * consumer are untouched.
 */

import {
  canonicalJson,
  heldChannelKeys,
  isLive,
  type CommunityList,
  type CommunityListEntry,
  type CommunityTombstone,
  type JoinMaterial,
} from "./communityList";

/**
 * The relay ceiling the List actually has to fit — the refusal line. The binding
 * limit is the encoded EVENT, never the NIP-44 plaintext: content is base64
 * ciphertext at ~4/3, so a plaintext-only check mints events every relay refuses.
 */
export const MAX_EVENT_BYTES = 65_536;

/**
 * The pack target (CORD-02 §8 SHOULD): comfortably under the ceiling, because
 * 65,536 is itself a common relay cap and an event AT it is a `>` vs `>=`
 * lottery between relay implementations.
 */
export const PACK_TARGET_BYTES = 57_344;

/**
 * Everything in the signed event that isn't `content` — id, pubkey, sig, kind,
 * created_at, the `d` tag, JSON scaffolding. Deliberately generous.
 */
const EVENT_ENVELOPE_BYTES = 320;

// ── wire ─────────────────────────────────────────────────────────────────────

/** One fragment. `frags` is the total, declared in every fragment. */
export interface FragList {
  frags: number;
  entries: FragEntry[];
  tombstones: FragTombstone[];
  extra: Record<string, unknown>;
}

export interface FragEntry {
  community_id: string;
  /** Absent when it equals `current` — which is what absence means. */
  seed?: FragMaterial;
  current: FragMaterial;
  added_at: number;
  extra: Record<string, unknown>;
}

/**
 * Join material as embedded in an entry: no `community_id`, it inherits the
 * entry's. A standalone snapshot (a CORD-06 §1 dissolution payload) keeps its.
 */
export interface FragMaterial {
  owner: string;
  owner_salt: string;
  community_root: string;
  root_epoch: number;
  control_pk?: string;
  control_root?: string;
  channels: FragChannel[];
  relays: string[];
  name: string;
  extra: Record<string, unknown>;
}

export interface FragChannel {
  id: string;
  key?: string;
  epoch: number;
  name: string;
  /**
   * Armada's `priors` ride here. Without it a republish takes every other
   * channel's pre-rotation history dark.
   */
  extra: Record<string, unknown>;
}

export interface FragTombstone {
  community_id: string;
  removed_at: number;
  extra: Record<string, unknown>;
}

// ── encoding ─────────────────────────────────────────────────────────────────

const HEX64 = /^[0-9a-fA-F]{64}$/;
const B64URL43 = /^[A-Za-z0-9_-]{43}$/;

/**
 * 32 bytes of hex to unpadded base64url (43 chars). Anything that is not
 * exactly 32 bytes of hex passes through untouched: the amendment re-encodes
 * KEYS, and an unknown field from a peer may hold anything at all.
 */
function b64(value: string): string {
  if (!HEX64.test(value)) return value;
  let bin = "";
  for (let i = 0; i < 64; i += 2) bin += String.fromCharCode(parseInt(value.slice(i, i + 2), 16));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Unpadded base64url back to 32 bytes of hex. Anything that isn't a 43-char
 * base64 value passes through untouched — the same tolerance as {@link b64},
 * and what lets a document carrying both encodings round-trip either way.
 */
function unb64(value: string): string {
  if (!B64URL43.test(value)) return value;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=";
  let bin: string;
  try {
    bin = atob(padded);
  } catch {
    return value;
  }
  if (bin.length !== 32) return value;
  let hex = "";
  for (let i = 0; i < 32; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  return hex;
}

/** The named (non-extra) keys at each wire level, in serde's declared order. */
const MATERIAL_KEYS = ["owner", "owner_salt", "community_root", "root_epoch", "control_pk", "control_root", "channels", "relays", "name"] as const;
const CHANNEL_KEYS = ["id", "key", "epoch", "name"] as const;
const ENTRY_KEYS = ["community_id", "seed", "current", "added_at"] as const;
const TOMBSTONE_KEYS = ["community_id", "removed_at"] as const;
const LIST_KEYS = ["frags", "entries", "tombstones"] as const;

function splitExtra(src: Record<string, unknown>, named: readonly string[]): Record<string, unknown> {
  // Object.fromEntries defines OWN data properties, so a hostile "__proto__"
  // key survives as an ordinary field — exactly as serde keeps it as an
  // ordinary map key. Plain `extra[k] = v` would instead hit the inherited
  // accessor and silently drop the key, forking the bytes from the reference.
  return Object.fromEntries(
    Object.keys(src)
      .filter((k) => !named.includes(k) && src[k] !== undefined)
      .map((k) => [k, src[k]]),
  );
}

function material(src: JoinMaterial): FragMaterial {
  // A corrupt internal snapshot (a damaged folded cache) must fail the publish
  // LOUDLY here, not seal `"name":undefined` — invalid JSON — into an event
  // every client rejects. Rust's types make this unrepresentable.
  if (
    typeof src.owner !== "string" ||
    typeof src.owner_salt !== "string" ||
    typeof src.community_root !== "string" ||
    typeof src.name !== "string" ||
    typeof src.root_epoch !== "number"
  ) {
    throw new Error("malformed join material — refusing to serialize a corrupt snapshot");
  }
  const out: FragMaterial = {
    owner: b64(src.owner),
    owner_salt: b64(src.owner_salt),
    community_root: b64(src.community_root),
    root_epoch: src.root_epoch,
    channels: heldChannelKeys(src.channels).map(channel),
    relays: Array.isArray(src.relays) ? [...src.relays] : [],
    name: src.name,
    // `community_id` is named-but-dropped: the entry already keys it.
    extra: splitExtra(src, [...MATERIAL_KEYS, "community_id"]),
  };
  if (typeof src.control_pk === "string") out.control_pk = b64(src.control_pk);
  if (typeof src.control_root === "string") out.control_root = b64(src.control_root);
  return out;
}

function channel(src: JoinMaterial["channels"][number]): FragChannel {
  const out: FragChannel = {
    id: b64(src.id),
    epoch: src.epoch,
    name: src.name,
    extra: splitExtra(src, [...CHANNEL_KEYS]),
  };
  if (typeof src.key === "string") out.key = b64(src.key);
  return out;
}

// ── decoding ─────────────────────────────────────────────────────────────────

function unmaterial(src: FragMaterial, communityId: string): JoinMaterial {
  const jm: JoinMaterial = {
    ...src.extra,
    // Inherited from the entry — the embedded form never carries it.
    community_id: communityId,
    owner: unb64(src.owner),
    owner_salt: unb64(src.owner_salt),
    community_root: unb64(src.community_root),
    root_epoch: src.root_epoch,
    channels: src.channels.map((c) => {
      const ch = {
        ...c.extra,
        id: unb64(c.id),
        epoch: c.epoch,
        name: c.name,
      } as JoinMaterial["channels"][number];
      if (typeof c.key === "string") ch.key = unb64(c.key);
      return ch;
    }),
    relays: [...src.relays],
    name: src.name,
  };
  if (typeof src.control_pk === "string") jm.control_pk = unb64(src.control_pk);
  if (typeof src.control_root === "string") jm.control_root = unb64(src.control_root);
  return jm;
}

/**
 * Union a fragment set back into one list. Entries and tombstones from every
 * fragment are concatenated; a `community_id` appearing in more than one
 * fragment is merged by the caller's own merge, never duplicated here — an
 * interrupted repack legitimately leaves one in two places.
 *
 * Fragment-level unknowns belong to the List, not to their fragment (CORD-02
 * §8): pass fragments in index order and the lowest index wins a key.
 */
export function defragment(frags: FragList[]): CommunityList {
  const out: CommunityList = { entries: [], tombstones: [] };
  for (const f of frags) {
    for (const e of f.entries) {
      const cid = unb64(e.community_id);
      const current = unmaterial(e.current, cid);
      // Absent seed means "equal to current" — that is what absence means.
      const seed = e.seed ? unmaterial(e.seed, cid) : structuredClone(current);
      out.entries.push({
        ...e.extra,
        community_id: cid,
        seed,
        current,
        added_at: e.added_at,
      } as CommunityListEntry);
    }
    for (const t of f.tombstones) {
      out.tombstones.push({
        ...t.extra,
        community_id: unb64(t.community_id),
        removed_at: t.removed_at,
      } as CommunityTombstone);
    }
    for (const [k, v] of Object.entries(f.extra)) {
      if (!Object.prototype.hasOwnProperty.call(out, k)) {
        // defineProperty, not assignment: a "__proto__" list-extra must land as
        // an own data property (as serde would keep it), never as a prototype swap.
        Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
      }
    }
  }
  return out;
}

// ── serialization (the pinned bytes) ─────────────────────────────────────────

/** Emit sorted extras after the named fields — serde's flatten over a BTreeMap. */
function emitExtras(extra: Record<string, unknown>, parts: string[]): void {
  for (const k of Object.keys(extra).sort()) {
    parts.push(`${JSON.stringify(k)}:${canonicalJson(extra[k])}`);
  }
}

function serializeChannel(c: FragChannel): string {
  const parts = [`"id":${JSON.stringify(c.id)}`];
  if (c.key !== undefined) parts.push(`"key":${JSON.stringify(c.key)}`);
  parts.push(`"epoch":${JSON.stringify(c.epoch)}`, `"name":${JSON.stringify(c.name)}`);
  emitExtras(c.extra, parts);
  return `{${parts.join(",")}}`;
}

function serializeMaterial(m: FragMaterial): string {
  const parts = [
    `"owner":${JSON.stringify(m.owner)}`,
    `"owner_salt":${JSON.stringify(m.owner_salt)}`,
    `"community_root":${JSON.stringify(m.community_root)}`,
    `"root_epoch":${JSON.stringify(m.root_epoch)}`,
  ];
  if (m.control_pk !== undefined) parts.push(`"control_pk":${JSON.stringify(m.control_pk)}`);
  if (m.control_root !== undefined) parts.push(`"control_root":${JSON.stringify(m.control_root)}`);
  if (m.channels.length > 0) parts.push(`"channels":[${m.channels.map(serializeChannel).join(",")}]`);
  if (m.relays.length > 0) parts.push(`"relays":[${m.relays.map((r) => JSON.stringify(r)).join(",")}]`);
  parts.push(`"name":${JSON.stringify(m.name)}`);
  emitExtras(m.extra, parts);
  return `{${parts.join(",")}}`;
}

export function serializeFragEntry(e: FragEntry): string {
  const parts = [`"community_id":${JSON.stringify(e.community_id)}`];
  if (e.seed !== undefined) parts.push(`"seed":${serializeMaterial(e.seed)}`);
  parts.push(`"current":${serializeMaterial(e.current)}`, `"added_at":${JSON.stringify(e.added_at)}`);
  emitExtras(e.extra, parts);
  return `{${parts.join(",")}}`;
}

export function serializeFragTombstone(t: FragTombstone): string {
  const parts = [
    `"community_id":${JSON.stringify(t.community_id)}`,
    `"removed_at":${JSON.stringify(t.removed_at)}`,
  ];
  emitExtras(t.extra, parts);
  return `{${parts.join(",")}}`;
}

/** The fragment's exact plaintext bytes — what NIP-44 seals and relays store. */
export function serializeFragList(f: FragList): string {
  const parts = [`"frags":${JSON.stringify(f.frags)}`];
  if (f.entries.length > 0) parts.push(`"entries":[${f.entries.map(serializeFragEntry).join(",")}]`);
  if (f.tombstones.length > 0) parts.push(`"tombstones":[${f.tombstones.map(serializeFragTombstone).join(",")}]`);
  emitExtras(f.extra, parts);
  return `{${parts.join(",")}}`;
}

// ── parsing (mirrors serde's strictness) ─────────────────────────────────────

class FragParseError extends Error {}

function asObject(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new FragParseError(`${what} is not an object`);
  return v as Record<string, unknown>;
}

/**
 * Rust u64: an unsigned integer — floats and negatives reject the fragment.
 * SAFE integers only: beyond 2^53 the value already lost precision in
 * JSON.parse, and re-serializing it emits exponential notation serde_json
 * cannot read back as a u64 — an Armada-authored fragment every Rust client
 * would treat as permanently unreadable. (`-0` re-serializes as `0`, which is
 * a byte change too.)
 */
function asU64(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || Object.is(v, -0)) {
    throw new FragParseError(`${what} is not an unsigned integer`);
  }
  return v;
}

function asString(v: unknown, what: string): string {
  if (typeof v !== "string") throw new FragParseError(`${what} is not a string`);
  return v;
}

// serde reads an explicit `null` for an Option field as absent and serializes
// it away — mirror that for the four Option fields (`key`, `seed`,
// `control_pk`, `control_root`) so a null-emitting client round-trips to the
// same bytes here as through the reference.
const absent = (v: unknown): v is undefined | null => v === undefined || v === null;

function parseChannel(v: unknown): FragChannel {
  const o = asObject(v, "channel");
  const out: FragChannel = {
    id: asString(o.id, "channel.id"),
    epoch: asU64(o.epoch, "channel.epoch"),
    name: asString(o.name, "channel.name"),
    extra: splitExtra(o, [...CHANNEL_KEYS]),
  };
  if (!absent(o.key)) out.key = asString(o.key, "channel.key");
  return out;
}

function parseMaterial(v: unknown, what: string): FragMaterial {
  const o = asObject(v, what);
  const out: FragMaterial = {
    owner: asString(o.owner, `${what}.owner`),
    owner_salt: asString(o.owner_salt, `${what}.owner_salt`),
    community_root: asString(o.community_root, `${what}.community_root`),
    root_epoch: asU64(o.root_epoch, `${what}.root_epoch`),
    channels: o.channels === undefined ? [] : (Array.isArray(o.channels) ? o.channels.map(parseChannel) : (() => { throw new FragParseError(`${what}.channels is not an array`); })()),
    relays: o.relays === undefined ? [] : (Array.isArray(o.relays) ? o.relays.map((r) => asString(r, `${what}.relays[]`)) : (() => { throw new FragParseError(`${what}.relays is not an array`); })()),
    name: asString(o.name, `${what}.name`),
    extra: splitExtra(o, [...MATERIAL_KEYS]),
  };
  if (!absent(o.control_pk)) out.control_pk = asString(o.control_pk, `${what}.control_pk`);
  if (!absent(o.control_root)) out.control_root = asString(o.control_root, `${what}.control_root`);
  return out;
}

function parseEntry(v: unknown): FragEntry {
  const o = asObject(v, "entry");
  const out: FragEntry = {
    community_id: asString(o.community_id, "entry.community_id"),
    current: parseMaterial(o.current, "entry.current"),
    added_at: asU64(o.added_at, "entry.added_at"),
    extra: splitExtra(o, [...ENTRY_KEYS]),
  };
  if (!absent(o.seed)) out.seed = parseMaterial(o.seed, "entry.seed");
  return out;
}

function parseTombstone(v: unknown): FragTombstone {
  const o = asObject(v, "tombstone");
  return {
    community_id: asString(o.community_id, "tombstone.community_id"),
    removed_at: asU64(o.removed_at, "tombstone.removed_at"),
    extra: splitExtra(o, [...TOMBSTONE_KEYS]),
  };
}

/**
 * Parse a fragment's decrypted plaintext. Throws on anything the reference
 * implementation would reject (a missing `frags`, a malformed entry) — a
 * fragment that fails here is unreadable, which the fetch treats as "index
 * missing", never as an empty fragment.
 */
export function parseFragList(json: string): FragList {
  const o = asObject(JSON.parse(json), "fragment");
  return {
    frags: asU64(o.frags, "frags"),
    entries: o.entries === undefined ? [] : (Array.isArray(o.entries) ? o.entries.map(parseEntry) : (() => { throw new FragParseError("entries is not an array"); })()),
    tombstones: o.tombstones === undefined ? [] : (Array.isArray(o.tombstones) ? o.tombstones.map(parseTombstone) : (() => { throw new FragParseError("tombstones is not an array"); })()),
    extra: splitExtra(o, [...LIST_KEYS]),
  };
}

// ── sizing ───────────────────────────────────────────────────────────────────

const utf8 = new TextEncoder();

function byteLen(s: string): number {
  return utf8.encode(s).length;
}

/** NIP-44 v2 padded plaintext length. */
export function nip44PaddedLen(unpadded: number): number {
  if (unpadded <= 32) return 32;
  const nextPower = 2 ** (32 - Math.clz32(unpadded - 1));
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((unpadded - 1) / chunk) + 1);
}

/**
 * The encoded event a plaintext of `n` bytes becomes: NIP-44 v2 is
 * `version ‖ nonce ‖ len ‖ padded ‖ mac`, base64'd into `content`.
 */
export function projectedEventBytes(plaintext: number): number {
  const raw = 1 + 32 + 2 + nip44PaddedLen(plaintext) + 32;
  return Math.ceil(raw / 3) * 4 + EVENT_ENVELOPE_BYTES;
}

// ── fragmentation ────────────────────────────────────────────────────────────

/**
 * Pack the list into fragments, each projected to fit {@link PACK_TARGET_BYTES}.
 *
 * Greedy and order-preserving: an entry lands in the first fragment with room.
 * Placement is arbitrary by design — a `community_id` in two fragments merges,
 * so guessing wrong costs a duplicate, never a loss.
 *
 * An entry its tombstone outranks is dropped (CORD-02 §8) — a membership is live
 * only while its entry beats its removal, so a stale fragment re-unioning the
 * retired entry still reads as left.
 */
export function fragment(list: CommunityList): FragList[] {
  const entries: FragEntry[] = list.entries
    .filter((e) => isLive(list, e.community_id))
    .map((e) => {
      const current = material(e.current);
      const seed = material(e.seed);
      // seed's cosmetic fields are current's (CORD-02 §8): seed anchors keys,
      // and comparing labels would let one rename fork the snapshots forever.
      seed.name = current.name;
      seed.relays = [...current.relays];
      for (const ch of seed.channels) {
        const cur = current.channels.find((c) => c.id === ch.id);
        if (cur) ch.name = cur.name;
      }
      const out: FragEntry = {
        community_id: b64(e.community_id),
        current,
        added_at: e.added_at,
        extra: splitExtra(e, [...ENTRY_KEYS]),
      };
      // The omission that pays for itself: identical snapshots are the
      // common case, and every unrefounded membership has them.
      if (serializeMaterial(seed) !== serializeMaterial(current)) out.seed = seed;
      return out;
    });
  const tombs: FragTombstone[] = list.tombstones.map((t) => ({
    community_id: b64(t.community_id),
    removed_at: t.removed_at,
    extra: splitExtra(t, [...TOMBSTONE_KEYS]),
  }));

  const frags: FragList[] = [
    { frags: 1, entries: [], tombstones: [], extra: splitExtra(list, ["entries", "tombstones"]) },
  ];
  // Room left in the current fragment, measured against the projected event.
  const fits = (f: FragList, add: number) =>
    projectedEventBytes(byteLen(serializeFragList(f)) + add) <= PACK_TARGET_BYTES;

  for (const e of entries) {
    const cost = byteLen(serializeFragEntry(e)) + 1;
    const last = frags[frags.length - 1];
    if (last.entries.length === 0 || fits(last, cost)) {
      last.entries.push(e);
    } else {
      frags.push({ frags: 1, entries: [e], tombstones: [], extra: {} });
    }
  }
  for (const t of tombs) {
    const cost = byteLen(serializeFragTombstone(t)) + 1;
    const last = frags[frags.length - 1];
    if (last.tombstones.length === 0 || fits(last, cost)) {
      last.tombstones.push(t);
    } else {
      frags.push({ frags: 1, entries: [], tombstones: [t], extra: {} });
    }
  }

  const total = frags.length;
  for (const f of frags) f.frags = total;
  return frags;
}

/** A fragment that reads as an empty List — what an emptied index republishes. */
export function emptyFragList(frags: number): FragList {
  return { frags, entries: [], tombstones: [], extra: {} };
}
