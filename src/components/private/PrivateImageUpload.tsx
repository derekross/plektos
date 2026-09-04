/**
 * Cover image for a private party.
 *
 * The ordinary ImageUpload pushes the file to Blossom the instant it is picked
 * and hands back a URL — by publish time the plaintext is already public. For a
 * private party that is the whole problem, so this path encrypts FIRST and
 * uploads only ciphertext. The server stores bytes it cannot read; the key
 * travels inside the encrypted event, so only guests can decrypt it.
 *
 * The preview is a local object URL from the original file, never the upload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { encryptImageBlob } from "@/concord/lib/image";
import type { ImagePointer } from "@/concord/lib/types";
import { useBlossomUpload } from "@/hooks/useBlossomUpload";

const MAX_BYTES = 10 * 1024 * 1024;

export function PrivateImageUpload({
  value,
  onChange,
}: {
  value?: ImagePointer;
  onChange: (pointer: ImagePointer | undefined) => void;
}) {
  const { uploadFile } = useBlossomUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);

  /**
   * Object URLs are not garbage collected — the blob stays alive until the URL
   * is revoked, so a host who tries four covers in a row pins four full images
   * in memory for the life of the tab. Revoke the previous one on every change,
   * and the last one on unmount.
   *
   * The ref shadows the state deliberately: the unmount cleanup must see the
   * CURRENT url, and an effect closing over `preview` would capture whichever
   * value it last ran with.
   */
  const previewRef = useRef<string>();
  const showPreview = useCallback((url: string | undefined) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  }, []);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const pick = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > MAX_BYTES) return toast.error("Image must be under 10MB");

    setBusy(true);
    try {
      showPreview(URL.createObjectURL(file));
      const { ciphertext, key, nonce, hash } = await encryptImageBlob(file);
      // Uploaded as an opaque blob: no image mime type, no original filename.
      const blob = new File([ciphertext], `${hash.slice(0, 16)}.bin`, {
        type: "application/octet-stream",
      });
      const result = await uploadFile(blob);
      onChange({ url: result.url, key, nonce, hash });
    } catch (err) {
      showPreview(undefined);
      toast.error(err instanceof Error ? err.message : "Couldn't add that image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-lg font-semibold">Cover image (optional)</Label>
      <p className="text-sm text-muted-foreground">
        Encrypted before it leaves your device — the image host stores bytes it can't read.
      </p>

      {preview || value ? (
        <div className="relative overflow-hidden rounded-2xl border">
          {preview && <img src={preview} alt="Cover preview" className="max-h-56 w-full object-cover" />}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute right-2 top-2"
            onClick={() => {
              showPreview(undefined);
              onChange(undefined);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-2xl py-8"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Encrypting…
            </>
          ) : (
            <>
              <ImageIcon className="mr-2 size-4" /> Add a cover
            </>
          )}
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) pick(file);
        }}
      />
    </div>
  );
}
