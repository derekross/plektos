/**
 * Sign-Up Board data model.
 *
 * Items are kind 31800 rumors inside the sign-up channel.
 * The content is JSON carrying the item details.
 */

export interface SignUpItem {
  /** The rumor id (d-tag for paramitized replaceable within the channel). */
  id: string;
  /** Category key — built-ins (seafood, drinks, …) or any custom name. */
  category: string;
  name: string;
  /** Pubkey of the claimer, or undefined if unclaimed. */
  claimedBy?: string;
  claimedAt?: number;
  notes?: string;
  /** Who created the item. */
  createdBy: string;
  createdAt: number;
}

/** Kind for sign-up items inside the encrypted channel. */
export const KIND_SIGNUP_ITEM = 31800;

/** Parse a rumor content into a SignUpItem. */
export function parseSignUpItem(content: string, rumorId: string, author: string, createdAt: number): SignUpItem | null {
  try {
    const data = JSON.parse(content);
    if (typeof data.name !== "string" || typeof data.category !== "string") return null;
    return {
      id: rumorId,
      category: data.category,
      name: data.name,
      claimedBy: data.claimedBy || undefined,
      claimedAt: data.claimedAt || undefined,
      notes: data.notes || undefined,
      createdBy: author,
      createdAt,
    };
  } catch {
    return null;
  }
}

/** Serialize a sign-up item for publishing. */
export function serializeSignUpItem(item: Omit<SignUpItem, "id" | "createdBy" | "createdAt">): string {
  return JSON.stringify({
    name: item.name,
    category: item.category,
    claimedBy: item.claimedBy || "",
    claimedAt: item.claimedAt || 0,
    notes: item.notes || "",
  });
}
