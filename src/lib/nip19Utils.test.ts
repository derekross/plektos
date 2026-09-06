import { describe, it, expect } from 'vitest';
import { bech32 } from 'bech32';
import * as nip19 from 'nostr-tools/nip19';
import { createEventIdentifier, decodeEventIdentifier, createEventUrl, isReplaceableEvent } from './nip19Utils';
import type { BaseEvent } from './eventTypes';

describe('nip19Utils', () => {
  const replaceableEvent: BaseEvent = {
    id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    pubkey: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    created_at: 1234567890,
    kind: 31922, // Date-based event (replaceable)
    content: 'Test event',
    tags: [['d', 'unique-identifier'], ['title', 'Test Event']],
  };

  const regularEvent: BaseEvent = {
    id: '9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
    pubkey: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
    created_at: 1234567890,
    kind: 1, // Regular note (not replaceable)
    content: 'Test note',
    tags: [],
  };

  describe('isReplaceableEvent', () => {
    it('identifies replaceable events correctly', () => {
      expect(isReplaceableEvent(31922)).toBe(true);
      expect(isReplaceableEvent(31923)).toBe(true);
      expect(isReplaceableEvent(30000)).toBe(true);
      expect(isReplaceableEvent(39999)).toBe(true);
      expect(isReplaceableEvent(1)).toBe(false);
      expect(isReplaceableEvent(7)).toBe(false);
      expect(isReplaceableEvent(40000)).toBe(false);
    });
  });

  describe('createEventIdentifier', () => {
    it('creates naddr for replaceable events', () => {
      const identifier = createEventIdentifier(replaceableEvent);
      expect(identifier).toMatch(/^naddr1/);
    });

    it('creates nevent for regular events', () => {
      const identifier = createEventIdentifier(regularEvent);
      expect(identifier).toMatch(/^nevent1/);
    });

    it('throws error when replaceable event is missing d tag', () => {
      const invalidEvent = { ...replaceableEvent, tags: [] };
      expect(() => createEventIdentifier(invalidEvent)).toThrow('Replaceable event missing d tag');
    });
  });

  describe('decodeEventIdentifier', () => {
    it('decodes naddr identifiers correctly', () => {
      const identifier = createEventIdentifier(replaceableEvent);
      const decoded = decodeEventIdentifier(identifier);
      
      expect(decoded.type).toBe('naddr');
      if (decoded.type === 'naddr') {
        expect(decoded.data.kind).toBe(31922);
        expect(decoded.data.pubkey).toBe('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
        expect(decoded.data.identifier).toBe('unique-identifier');
        expect(decoded.filter).toEqual({
          kinds: [31922],
          authors: ['abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'],
          '#d': ['unique-identifier'],
        });
      }
    });

    it('decodes nevent identifiers correctly', () => {
      const identifier = createEventIdentifier(regularEvent);
      const decoded = decodeEventIdentifier(identifier);
      
      expect(decoded.type).toBe('nevent');
      if (decoded.type === 'nevent') {
        expect(decoded.data.id).toBe('9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba');
        expect(decoded.filter).toEqual({
          ids: ['9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba'],
        });
      }
    });

    it('handles raw event IDs', () => {
      const decoded = decodeEventIdentifier('event789');
      
      expect(decoded.type).toBe('raw');
      expect(decoded.data).toBe('event789');
      expect(decoded.filter).toEqual({
        ids: ['event789'],
      });
    });
  });

  describe('createEventUrl', () => {
    it('creates proper URLs with correct identifiers', () => {
      const replaceableUrl = createEventUrl(replaceableEvent, 'https://example.com');
      const regularUrl = createEventUrl(regularEvent, 'https://example.com');
      
      expect(replaceableUrl).toMatch(/^https:\/\/example\.com\/event\/naddr1/);
      expect(regularUrl).toMatch(/^https:\/\/example\.com\/event\/nevent1/);
    });
  });
});
/**
 * A malformed TLV identifier must not hang the tab.
 *
 * nostr-tools <= 2.23.x looped forever in `parseTLV` when the data ended in a
 * stray byte: with one byte left, the length read as `undefined`, the cursor
 * advanced by `NaN` — which `Uint8Array.slice` treats as 0 — and the loop
 * never made progress. Plektos decodes NIP-19 identifiers pulled straight out
 * of relay-supplied note content, so anyone could publish a note that froze
 * the browser of everyone who scrolled past it.
 *
 * Note for whoever sees this fail: a regression shows up as the SUITE HANGING,
 * not as a failed assertion. The bug is a synchronous infinite loop, so no
 * test timeout can interrupt it. A hung run here means nostr-tools went
 * backwards.
 */
describe("malformed NIP-19 TLV", () => {
  it("throws instead of looping forever", () => {
    // A valid entry (type 0, length 32, 32 bytes) plus one trailing byte.
    const data = new Uint8Array([0, 32, ...new Uint8Array(32).fill(7), 1]);
    const hostile = bech32.encode("nevent", bech32.toWords(data), 5000);

    expect(() => nip19.decode(hostile)).toThrow();
  });

  it("still decodes a well-formed identifier", () => {
    const pubkey = "a".repeat(64);
    expect(nip19.decode(nip19.npubEncode(pubkey)).data).toBe(pubkey);
  });
});
