# Plektos wire format

What Plektos puts on relays beyond plain NIP-52, and — for private events — which
parts of another protocol it implements and which it deliberately does not.

## Public events

Plektos creates NIP-52 `31922` (date-based) and `31923` (time-based) calendar events
and `31925` RSVPs. On top of the standard tags it writes three extensions, none of
which were previously documented.

### Poster theme and effect tags

On `31922` / `31923`, purely presentational and safe for any client to ignore:

| tag | form | meaning |
| --- | --- | --- |
| `c` | `["c", "<hex>", "<role>"]` | a theme colour; repeated per role |
| `f` | `["f", "<family>", "<url>", "<role>"]` | a theme font |
| `bg` | `["bg", …]` | poster background |
| `fx` | `["fx", "<effect>"]` | the ambient "Living Poster" effect |

Built by `buildThemeTags` (`src/lib/themes.ts`) and `buildEffectTag`
(`src/lib/effects.ts`). Compatible with Ditto's profile-theme vocabulary.

### Recurring-series tags

On each occurrence of a recurring series:

`["recurring", "true"]`, `["series_id", "<id>"]`, `["series_index", "<n>"]`,
`["series_total", "<n>"]`

Each occurrence is a separate, independently addressable event; the tags only relate
them. Written by `src/pages/CreateEvent.tsx`.

### Paid-ticket tags

`["price", "<sats>"]` and `["lud16", "<lightning address>"]` on `31922` / `31923`.

### Kind 31926 — ticket check-in

Addressable, written by `src/pages/VerifyTicket.tsx` to record that a ticket was
checked in at the door. Pre-existing and previously undocumented; recorded here
because an undocumented custom kind is exactly the thing that fragments an
ecosystem.

## Private events

A private Plektos event is **a private channel in a Concord V2 community**, not a
NIP-52 event on relays.
Plektos is an *implementer* of Concord, not the author of it: the wire format is
specified by CORD-01 … CORD-08 (https://github.com/concord-protocol/concord) and
implemented by `src/concord/lib`, vendored from `@concord-protocol/core`, which is
extracted from Armada, the reference client.

Nothing below re-specifies Concord. It documents only Plektos's **profile choices** —
the things another Concord client needs to know to interoperate.

### The mapping

```
one HOST          ≡  one Concord community, "Plektos Events"
  owner              the host
  community_id       sha256("concord/community" ‖ owner_xonly ‖ owner_salt)
  root_epoch         0
one PRIVATE EVENT ≡  one PRIVATE channel in it
  channel_id         random 32 bytes
  channel_key        random 32 bytes, independent of community_root
  epoch              0
```

One community per *event* was built first and abandoned: a Concord client renders
every entry in the shared key list as a community, so a host's sidebar accumulated
one community per party, permanently.

Isolation is preserved by the channel being PRIVATE. Its key is independent of the
community root, and an invite bundle carries **exactly the one channel it is for**.
Plektos deliberately publishes **no channel edition (`vsk 2`) per party**: a private
channel renders from a held key alone, so omitting the edition means a guest of one
party cannot see that the others exist, rather than merely being unable to read them.

What the community root does grant a guest: the Control Plane and any PUBLIC channel.
Plektos creates none. The honest cost of this mapping is that one root now covers
every one of a host's parties, so a rekey would affect all of them at once.

The host's community is marked in their key list with `plektos_events: true` on the
join material, which rides the index signature and survives the fragment round trip.
Matching on the community NAME instead would break as soon as a user renamed it.

Inside that channel's stream, as rumors:

| kind | role |
| --- | --- |
| `31922` / `31923` | **the event itself.** Its `d` is stable across edits |
| `31925` | RSVPs, `e`-tagging the calendar rumor id |
| `31800` | sign-up board items |
| `9` / `7` / `5` / `3302` | chat, reactions, deletes, edits |

RSVPs `e`-tag a **rumor id**, not an `a` coordinate, because an unsigned rumor has no
addressable coordinate. Editing republishes under the same `d` and mints a new rumor
id, so readers must re-point votes from a superseded rumor id onto the current holder
of that coordinate. Plektos does this in `usePrivateEventCalendar`.

### Contribution extension

Custom tags on the calendar rumor, ignored by other NIP-52 clients, shared with
Armada and the Concord events app:

`["amount", "<sats>"]`, `["cashapp", "<handle>"]`, `["venmo", "<handle>"]`,
`["lightning", "<address>"]`

### Guest-count extension

`["guests", "<n>"]` on a `31925` RSVP: people the responder is bringing **in addition
to themselves**. Absent means just them. Capped at 20 by readers — the value rides in
an untrusted tag, and an unbounded one would let a single RSVP swamp a host's
headcount.

### Control plane

Plektos **writes** exactly ONE owner-signed edition, at version 1 with no `prevHash`
and no authority citation (the host is the owner, so delegation short-circuits):

| `vsk` | entity | when |
| --- | --- | --- |
| `0` | community metadata (name, description, relays) | once, when the host's community is minted |

No `vsk 2` channel edition is ever written — see above; that omission is what keeps
one party invisible to another party's guests.

Editions are sealed with `KIND_SEAL_PLAINTEXT` (20014), not the encrypted seal — an
encrypted seal could not survive a compaction re-wrap.

### What Plektos does NOT implement

This is the actual interop contract, and the most useful paragraph here. Plektos will
never author:

- roles (`vsk 1`), grants (`vsk 3`), banlists (`vsk 4`), invite registries (`vsk 8`),
  or dissolution (`vsk 10`);
- guestbook events (`3306` / `3309` / `3312`);
- rekey blobs (`3303`) — so a private event **cannot revoke access**; see below;
- compaction, voice (CORD-07), or direct invites (`3313`).

It reads all of the above where the vendored core supports it. A Concord client can
therefore expect a Plektos-created community to have a single metadata edition and
nothing else — no channel definitions at all, even though the community holds
channels. Those are discoverable only by holding their keys.

Membership keys live in kind **33302** fragments, NIP-44 encrypted to self — the
current Community List format. Plektos does not read or write the retired single-event
kind 13302.

### Security properties, stated plainly

- **No revocation.** A guest who holds the key keeps it. Removing someone stops new
  invites; it does not lock them out of what they already have. Concord's answer is a
  CORD-06 rekey, which Plektos does not implement.
- **Any keyholder can leak.** Shared-key group encryption has no answer to a member
  who screenshots or forwards the key.
- **The cover image IS encrypted** (AES-256-GCM), uploaded as an opaque blob, and its
  key travels inside the encrypted rumor. It rides an `["image_enc", "<pointer JSON>"]`
  tag — never the plain `image` tag, which other NIP-52 clients expect to be a URL and
  would render as a broken cover. `{url, key, nonce, hash}`; the plaintext SHA-256 is
  verified after decrypt.
- **Relays learn traffic shape.** They see a stream address, event volume and timing —
  not membership, content, kinds or author identities.
- **The invite link's secret is in the URL fragment**, so it never reaches a server.
  Anyone the link reaches can join.
