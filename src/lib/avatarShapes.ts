/**
 * Avatar Shapes — Ditto NIP-24 extension
 *
 * Allows users to set any emoji as the mask shape for their avatar.
 * The emoji is rendered to a canvas, converted to a white+alpha mask,
 * and applied via CSS mask-image.
 *
 * The shape is stored in the `shape` field of kind 0 metadata.
 */

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Check if a string is a valid emoji (non-ASCII, short). */
export function isEmoji(value: string): boolean {
  if (!value || value.length === 0) return false;
  if (value.length > 20) return false;
  // Check for non-ASCII characters (emoji contain characters > U+007F)
  // eslint-disable-next-line no-control-regex
  return /[^\u0000-\u007F]/.test(value);
}

/** Check if a value is a valid avatar shape. */
export function isValidAvatarShape(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  return isEmoji(value);
}

/** Extract the avatar shape from metadata, if valid. */
export function getAvatarShape(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const raw = metadata?.shape;
  return isValidAvatarShape(raw) ? raw : undefined;
}

// ---------------------------------------------------------------------------
// Emoji Mask Generation
// ---------------------------------------------------------------------------

const maskCache = new Map<string, string>();

/**
 * Render an emoji to a PNG data URL suitable for use as a CSS mask-image.
 *
 * Algorithm:
 * 1. Draw the emoji at 512px on a 768px scratch canvas
 * 2. Measure the tight bounding box of non-transparent pixels
 * 3. Square the crop (expand shorter axis, centered)
 * 4. Redraw the squared region onto a 256px output canvas
 * 5. Convert all pixels to white RGB, keeping original alpha
 * 6. Export as PNG data URL and cache
 */
export function getEmojiMaskUrl(emoji: string): string {
  const cached = maskCache.get(emoji);
  if (cached) return cached;

  // SSR guard
  if (typeof document === "undefined") return "";

  const fontSize = 512;
  const scratchSize = Math.round(fontSize * 1.5); // 768
  const outputSize = 256;

  // Step 1: Draw emoji on scratch canvas
  const scratch = document.createElement("canvas");
  scratch.width = scratchSize;
  scratch.height = scratchSize;
  const sctx = scratch.getContext("2d");
  if (!sctx) return "";

  sctx.textAlign = "center";
  sctx.textBaseline = "middle";
  sctx.font = `${fontSize}px serif`;
  sctx.fillText(emoji, scratchSize / 2, scratchSize / 2);

  // Step 2: Measure tight bounding box
  const imageData = sctx.getImageData(0, 0, scratchSize, scratchSize);
  const { data } = imageData;
  const alphaThreshold = 25;

  let minX = scratchSize, minY = scratchSize, maxX = 0, maxY = 0;
  for (let y = 0; y < scratchSize; y++) {
    for (let x = 0; x < scratchSize; x++) {
      const alpha = data[(y * scratchSize + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback if nothing rendered
  if (maxX <= minX || maxY <= minY) {
    const fallback = "";
    maskCache.set(emoji, fallback);
    return fallback;
  }

  // Step 3: Square the crop
  let cropW = maxX - minX + 1;
  let cropH = maxY - minY + 1;
  let cropX = minX;
  let cropY = minY;

  if (cropW > cropH) {
    const diff = cropW - cropH;
    cropY -= Math.floor(diff / 2);
    cropH = cropW;
  } else if (cropH > cropW) {
    const diff = cropH - cropW;
    cropX -= Math.floor(diff / 2);
    cropW = cropH;
  }

  // Clamp to canvas bounds
  cropX = Math.max(0, cropX);
  cropY = Math.max(0, cropY);

  // Step 4: Redraw onto output canvas
  const output = document.createElement("canvas");
  output.width = outputSize;
  output.height = outputSize;
  const octx = output.getContext("2d");
  if (!octx) return "";

  octx.drawImage(scratch, cropX, cropY, cropW, cropH, 0, 0, outputSize, outputSize);

  // Step 5: Convert to white + alpha mask
  const outData = octx.getImageData(0, 0, outputSize, outputSize);
  const pixels = outData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255;     // R → white
    pixels[i + 1] = 255; // G → white
    pixels[i + 2] = 255; // B → white
    // Alpha stays as-is
  }
  octx.putImageData(outData, 0, 0);

  // Step 6: Export and cache
  const url = output.toDataURL("image/png");
  maskCache.set(emoji, url);
  return url;
}

/** CSS style object for shaped avatar containers. */
export function getShapeMaskStyle(maskUrl: string): React.CSSProperties {
  return {
    WebkitMaskImage: `url(${maskUrl})`,
    maskImage: `url(${maskUrl})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
}

/** CSS style for a "border" effect on shaped avatars using drop-shadow. */
export const shapedAvatarBorderStyle: React.CSSProperties = {
  filter:
    "drop-shadow(2px 0 0 hsl(var(--background)))" +
    " drop-shadow(-2px 0 0 hsl(var(--background)))" +
    " drop-shadow(0 2px 0 hsl(var(--background)))" +
    " drop-shadow(0 -2px 0 hsl(var(--background)))",
};
