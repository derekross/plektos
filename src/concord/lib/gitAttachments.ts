/**
 * Git repository attachments on channel metadata.
 *
 * Carved behavior-for-behavior from Armada's `src/lib/gitActivity.ts` plus its
 * `parseAddr` / `nostrId` / `platform` helpers, because `types.ts`'s
 * `normalizeChannelMetadata` normalizes the `armada.git` custom extension and
 * `control.ts` calls it on every channel edition. Dropping it — as the original
 * port plan proposed — would silently change fold output.
 *
 * LAYERING NOTE: a protocol-core package normalizing one vendor's namespaced
 * extension is a layering error; this belongs behind a host-injected
 * normalizer port, like `ports.ts`. Deliberately deferred so the extraction is
 * proved green first, with Armada's suite as the safety net.
 *
 * The one intentional deviation: `isNostrId` used Nostrify's `NSchema.id()`;
 * here it is the equivalent 64-char lowercase-hex test, so this package keeps
 * its zero-Nostrify property.
 */

/** NIP-34 repository announcement. */
export const GIT_REPOSITORY_ANNOUNCEMENT_KIND = 30617;

function isNostrId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

interface ParsedAddr {
  kind: number;
  pubkey: string;
  identifier: string;
}

/**
 * Parse a NIP-01 addressable coordinate (`<kind>:<pubkey>:<d-tag>`). The
 * `d`-tag may be empty and may itself contain `:`, hence the slice-and-join.
 */
function parseAddr(value: string | undefined): ParsedAddr | undefined {
  if (!value) return undefined;
  const parts = value.split(":");
  if (parts.length < 3) return undefined;
  const kind = Number(parts[0]);
  if (!Number.isFinite(kind)) return undefined;
  const pubkey = parts[1];
  if (!isNostrId(pubkey)) return undefined;
  return { kind, pubkey, identifier: parts.slice(2).join(":") };
}

function normalizeRelayUrl(url: string): string | undefined {
  let value = url.trim();
  if (!value) return undefined;
  // A fully-qualified non-WebSocket URL is invalid, not a bare hostname. If it
  // were prefixed below, `https://relay.example` would become the valid but
  // nonsensical host `wss://https//relay.example`.
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) && !/^wss?:\/\//i.test(value)) {
    return undefined;
  }
  if (!/^wss?:\/\//i.test(value)) {
    // Bare hostnames are allowed for convenience; assume wss except localhost/IPs.
    const secure = !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
    value = `${secure ? "wss" : "ws"}://${value}`;
  }
  try {
    const u = new URL(value);
    if (u.protocol !== "ws:" && u.protocol !== "wss:") return undefined;
    return u.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizedRelays(values: readonly string[]): string[] {
  return unique(
    values
      .filter((value) => /^wss?:\/\//i.test(value.trim()))
      .map(normalizeRelayUrl)
      .filter((value): value is string => Boolean(value)),
  );
}

export interface GitRepositoryAddress {
  kind: typeof GIT_REPOSITORY_ANNOUNCEMENT_KIND;
  owner: string;
  identifier: string;
  coordinate: string;
  /** Normalized relay hint from the NIP-34 `a` tag, when present. */
  relayHint?: string;
}

/** Parse a canonical `30617:<owner-pubkey>:<d>` repository coordinate. */
export function parseGitRepositoryAddress(value: string | undefined): GitRepositoryAddress | undefined {
  const parsed = parseAddr(value);
  if (
    !parsed ||
    parsed.kind !== GIT_REPOSITORY_ANNOUNCEMENT_KIND ||
    !parsed.identifier ||
    parsed.pubkey !== parsed.pubkey.toLowerCase()
  ) {
    return undefined;
  }

  return {
    kind: GIT_REPOSITORY_ANNOUNCEMENT_KIND,
    owner: parsed.pubkey,
    identifier: parsed.identifier,
    coordinate: `${GIT_REPOSITORY_ANNOUNCEMENT_KIND}:${parsed.pubkey}:${parsed.identifier}`,
  };
}

export interface GitRepositoryAttachment {
  address: GitRepositoryAddress;
  relayHints: string[];
  attachedAt: number;
  detachedAt?: number;
}

/** Drop inverted intervals, normalize relay hints, sort, dedupe. */
export function normalizeGitRepositoryAttachments(
  attachments: readonly GitRepositoryAttachment[],
): GitRepositoryAttachment[] {
  const seen = new Set<string>();
  return attachments
    .filter((attachment) => attachment.detachedAt === undefined || attachment.detachedAt >= attachment.attachedAt)
    .map((attachment) => ({ ...attachment, relayHints: normalizedRelays(attachment.relayHints) }))
    .sort((a, b) => a.attachedAt - b.attachedAt || a.address.coordinate.localeCompare(b.address.coordinate))
    .filter((attachment) => {
      const key = `${attachment.address.coordinate}\u0000${attachment.attachedAt}\u0000${attachment.detachedAt ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** True when an event timestamp falls within an attachment's half-open interval. */
export function isGitRepositoryAttachedAt(
  attachment: GitRepositoryAttachment,
  createdAt: number,
): boolean {
  return (
    attachment.attachedAt <= createdAt &&
    (attachment.detachedAt === undefined || createdAt < attachment.detachedAt)
  );
}
