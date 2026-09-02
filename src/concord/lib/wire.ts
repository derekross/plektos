/**
 * The wire-format guard.
 *
 * Concord's `derive.ts` warns that "changing any labeled byte re-addresses
 * every prior event", and `kinds.ts` records numbers that are burned forever.
 * Nothing enforced either — which is exactly how kind 13302 came to be reused
 * by a fork after Armada retired it.
 *
 * Three cheap layers, all exercised by `test/wire.test.ts`:
 *
 *   1. Frozen derivation vectors (`vectors/derive.v1.json`) pin the ABSOLUTE
 *      output bytes of every derivation. Armada's own `derive.test.ts` only
 *      asserts relative properties — distinct, deterministic, rotates with
 *      epoch — and would pass with every HKDF label renamed.
 *   2. `RETIRED_KINDS` / `RETIRED_VSKS` assert that no burned number has
 *      crept back into the live registry.
 *   3. `WIRE_DIGEST` collapses the whole registry plus the vectors into one
 *      constant, so any wire change shows up as exactly ONE changed line in a
 *      diff — an unmissable review gate rather than a needle in 7,000 lines.
 *
 * Bumping `WIRE_VERSION` is a coordinated release across every consumer. It is
 * never a patch.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import * as kinds from "./kinds";

/** Incremented ONLY when a label, kind, locator shape or vsk changes. */
export const WIRE_VERSION = 1;

/**
 * Numbers that were used on the wire and must never be issued again.
 * 3300/3301/3304/3305/3307/3311/23308 are the CORD-02 Appendix B burns;
 * 13302 is the single-event Community List, superseded by 33302 fragments.
 */
export const RETIRED_KINDS: ReadonlySet<number> = new Set([
  3300, 3301, 3304, 3305, 3307, 3311, 23308, 13302,
]);

/** Control sub-kinds that were used and retired (7 = v1 owner attestation). */
export const RETIRED_VSKS: ReadonlySet<string> = new Set(["7"]);

/**
 * Live registry: every exported `KIND_*` number and `VSK_*` string.
 *
 * `KIND_COMMUNITY_LIST_RETIRED` is excluded by name — it exists precisely to
 * document a burned number, so counting it as live would make the retired
 * check contradict itself.
 */
export function liveRegistry(): { kinds: Record<string, number>; vsks: Record<string, string> } {
  const k: Record<string, number> = {};
  const v: Record<string, string> = {};
  for (const [name, value] of Object.entries(kinds as Record<string, unknown>)) {
    if (name === "KIND_COMMUNITY_LIST_RETIRED") continue;
    if (name.startsWith("KIND_") && typeof value === "number") k[name] = value;
    if (name.startsWith("VSK_") && typeof value === "string") v[name] = value;
  }
  return { kinds: k, vsks: v };
}

/**
 * Stable stringify: sorted keys at every level, so the digest is canonical.
 *
 * Deliberately module-private and NOT re-exported: `communityList` exports its
 * own `canonicalJson` for the list merge algebra. Two same-named exports in the
 * barrel would be ambiguous, and coupling the wire digest to the list
 * serializer would make a change in one silently move the other.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * sha256 over the live registry, the retired sets, and the frozen vectors.
 * Pass the parsed `vectors/derive.v1.json`.
 */
export function computeWireDigest(vectors: unknown): string {
  const { kinds: k, vsks } = liveRegistry();
  return bytesToHex(
    sha256(
      new TextEncoder().encode(
        canonicalJson({
          wireVersion: WIRE_VERSION,
          kinds: k,
          vsks,
          retiredKinds: [...RETIRED_KINDS].sort((a, b) => a - b),
          retiredVsks: [...RETIRED_VSKS].sort(),
          vectors,
        }),
      ),
    ),
  );
}

/**
 * The expected digest. Changing the wire changes this line and nothing else —
 * if a diff touches it, the change is a wire change, full stop.
 */
export const WIRE_DIGEST = "c266d8fdeac811686a8756af9ed366e6b695e71a3f6c43eb5578ff956314878e";
