import { useState, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Globe, Palette, X, Save, Loader2, ImagePlus, Trash2 } from "lucide-react";
import { sanitizeUrl } from "@/lib/utils";
import { useBlossomUpload } from "@/hooks/useBlossomUpload";
import { ThemePreview } from "@/components/ThemePreview";
import { ScopedTheme } from "@/components/ScopedTheme";
import {
  FEATURED_THEMES,
  buildThemeDefinitionTags,
  hexToHslString,
  hslStringToHex,
  type ThemeConfig,
  type ThemeDefinition,
} from "@/lib/themes";
import { useCommunityThemes } from "@/hooks/useCommunityThemes";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { toast } from "sonner";

interface ThemePickerProps {
  /** Currently selected theme config (null = no theme). */
  value: ThemeConfig | null;
  /** Called when the user selects or clears a theme. */
  onChange: (theme: ThemeConfig | null) => void;
}

/**
 * Theme picker with three tabs: Featured, Community, and Custom.
 *
 * Featured: curated presets shipped with the app.
 * Community: themes published by other users (kind 36767).
 * Custom: color pickers to build your own theme, with option to publish.
 */
export function ThemePicker({ value, onChange }: ThemePickerProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: communityThemes = [], isLoading: isLoadingCommunity } =
    useCommunityThemes();

  // Custom tab state
  const [customBg, setCustomBg] = useState(
    value ? hslStringToHex(value.colors.background) : "#1a0a2e",
  );
  const [customText, setCustomText] = useState(
    value ? hslStringToHex(value.colors.text) : "#e8e0f0",
  );
  const [customPrimary, setCustomPrimary] = useState(
    value ? hslStringToHex(value.colors.primary) : "#b84dff",
  );
  const [customBgImageUrl, setCustomBgImageUrl] = useState(
    value?.background?.url ?? "",
  );
  const [customBgMode, setCustomBgMode] = useState<"cover" | "tile">(
    value?.background?.mode ?? "cover",
  );
  const [publishTitle, setPublishTitle] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const { uploadFile, isUploading: isUploadingBg } = useBlossomUpload();
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const customTheme: ThemeConfig = {
    colors: {
      background: hexToHslString(customBg),
      text: hexToHslString(customText),
      primary: hexToHslString(customPrimary),
    },
    ...(customBgImageUrl
      ? { background: { url: customBgImageUrl, mode: customBgMode } }
      : {}),
  };

  const isSelected = useCallback(
    (theme: ThemeConfig) => {
      if (!value) return false;
      return (
        value.colors.background === theme.colors.background &&
        value.colors.text === theme.colors.text &&
        value.colors.primary === theme.colors.primary
      );
    },
    [value],
  );

  const handleSelectPreset = (theme: ThemeDefinition) => {
    if (isSelected(theme)) {
      onChange(null); // Deselect
    } else {
      onChange({ colors: theme.colors, fonts: theme.fonts, background: theme.background });
    }
  };

  const handleApplyCustom = () => {
    onChange(customTheme);
  };

  const handleClear = () => {
    onChange(null);
  };

  const handlePublishTheme = async () => {
    if (!user || !publishTitle.trim()) return;

    setIsPublishing(true);
    try {
      const identifier = publishTitle
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const tags = buildThemeDefinitionTags(identifier, publishTitle.trim(), customTheme);

      await publishEvent({
        kind: 36767,
        content: "",
        tags,
      });

      toast.success("Theme published to the community!");
      setPublishTitle("");
    } catch {
      toast.error("Failed to publish theme");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          Event Theme
        </Label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Current theme preview */}
      {value && (() => {
        const previewBgUrl = sanitizeUrl(value.background?.url);
        const previewBgStyle: React.CSSProperties = previewBgUrl
          ? {
              backgroundImage: `url(${previewBgUrl})`,
              backgroundSize: value.background?.mode === "tile" ? "auto" : "cover",
              backgroundPosition: "center",
              backgroundRepeat: value.background?.mode === "tile" ? "repeat" : "no-repeat",
            }
          : {};

        return (
          <ScopedTheme colors={value.colors} className="rounded-xl border overflow-hidden">
            <div
              className="relative bg-background p-4 space-y-1"
              style={previewBgStyle}
            >
              {/* Scrim for readability when there's a background image */}
              {previewBgUrl && (
                <div className="absolute inset-0 bg-background/60" />
              )}
              <div className="relative z-10">
                <div className="text-sm font-semibold text-foreground">
                  Theme Preview
                </div>
                <div className="text-xs text-muted-foreground">
                  This is how your event page will look
                </div>
                <div className="flex gap-2 mt-2">
                  <div className="h-6 px-3 rounded-full bg-primary text-primary-foreground text-xs flex items-center">
                    RSVP
                  </div>
                  <div className="h-6 px-3 rounded-full border border-border text-foreground text-xs flex items-center">
                    Share
                  </div>
                </div>
              </div>
            </div>
          </ScopedTheme>
        );
      })()}

      <Tabs defaultValue="featured" className="w-full">
        <TabsList className="grid grid-cols-3 mb-3">
          <TabsTrigger value="featured" className="text-xs gap-1">
            <Sparkles className="h-3 w-3" />
            Featured
          </TabsTrigger>
          <TabsTrigger value="community" className="text-xs gap-1">
            <Globe className="h-3 w-3" />
            Community
          </TabsTrigger>
          <TabsTrigger value="custom" className="text-xs gap-1">
            <Palette className="h-3 w-3" />
            Custom
          </TabsTrigger>
        </TabsList>

        {/* Featured Themes */}
        <TabsContent value="featured">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FEATURED_THEMES.map((theme) => (
              <ThemePreview
                key={theme.identifier}
                theme={theme}
                selected={isSelected(theme)}
                onClick={() => handleSelectPreset(theme)}
              />
            ))}
          </div>
        </TabsContent>

        {/* Community Themes */}
        <TabsContent value="community">
          {isLoadingCommunity ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading community themes...
              </span>
            </div>
          ) : communityThemes.length === 0 ? (
            <div className="text-center py-8">
              <Globe className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                No community themes yet. Be the first to publish one!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {communityThemes.map((theme) => (
                <ThemePreview
                  key={theme.identifier}
                  theme={theme}
                  selected={isSelected(theme)}
                  onClick={() => handleSelectPreset(theme)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Custom Theme */}
        <TabsContent value="custom">
          <div className="space-y-4">
            {/* Color pickers */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Background</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customBg}
                    onChange={(e) => setCustomBg(e.target.value)}
                    className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer"
                  />
                  <Input
                    value={customBg}
                    onChange={(e) => setCustomBg(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="#000000"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Text</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer"
                  />
                  <Input
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="#ffffff"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Accent</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPrimary}
                    onChange={(e) => setCustomPrimary(e.target.value)}
                    className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer"
                  />
                  <Input
                    value={customPrimary}
                    onChange={(e) => setCustomPrimary(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="#b84dff"
                  />
                </div>
              </div>
            </div>

            {/* Background image */}
            <div className="space-y-1.5">
              <Label className="text-xs">Background Image (optional)</Label>
              {customBgImageUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img
                    src={sanitizeUrl(customBgImageUrl) || ""}
                    alt="Theme background"
                    className="w-full h-20 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setCustomBgMode(customBgMode === "cover" ? "tile" : "cover");
                      }}
                      className="h-7 text-xs rounded-lg"
                    >
                      {customBgMode === "cover" ? "Cover" : "Tile"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setCustomBgImageUrl("")}
                      className="h-7 text-xs rounded-lg"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    ref={bgFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const result = await uploadFile(file);
                        setCustomBgImageUrl(result.url);
                      } catch {
                        // Upload error handled by hook
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => bgFileInputRef.current?.click()}
                    disabled={isUploadingBg}
                    className="h-8 text-xs rounded-lg flex-1"
                  >
                    {isUploadingBg ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <ImagePlus className="h-3 w-3 mr-1" />
                    )}
                    Upload Image
                  </Button>
                  <Input
                    placeholder="or paste URL..."
                    className="h-8 text-xs rounded-lg flex-1"
                    onBlur={(e) => {
                      const url = e.target.value.trim();
                      if (url && sanitizeUrl(url)) {
                        setCustomBgImageUrl(url);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const url = (e.target as HTMLInputElement).value.trim();
                        if (url && sanitizeUrl(url)) {
                          setCustomBgImageUrl(url);
                        }
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Live preview */}
            {(() => {
              const previewBgUrl = sanitizeUrl(customTheme.background?.url);
              const previewBgStyle: React.CSSProperties = previewBgUrl
                ? {
                    backgroundImage: `url(${previewBgUrl})`,
                    backgroundSize: customTheme.background?.mode === "tile" ? "auto" : "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: customTheme.background?.mode === "tile" ? "repeat" : "no-repeat",
                  }
                : {};

              return (
                <ScopedTheme colors={customTheme.colors} className="rounded-xl border overflow-hidden">
                  <div
                    className="relative bg-background p-3 space-y-1"
                    style={previewBgStyle}
                  >
                    {previewBgUrl && (
                      <div className="absolute inset-0 bg-background/60" />
                    )}
                    <div className="relative z-10">
                      <div className="text-sm font-semibold text-foreground">
                        Live Preview
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Your custom theme colors in action
                      </div>
                      <div className="flex gap-2 mt-2">
                        <div className="h-6 px-3 rounded-full bg-primary text-primary-foreground text-xs flex items-center">
                          Primary
                        </div>
                        <div className="h-6 px-3 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center">
                          Secondary
                        </div>
                      </div>
                    </div>
                  </div>
                </ScopedTheme>
              );
            })()}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleApplyCustom}
                className="flex-1 rounded-xl"
              >
                <Palette className="h-3.5 w-3.5 mr-1.5" />
                Apply to Event
              </Button>
            </div>

            {/* Publish to community */}
            {user && (
              <div className="border-t pt-3 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Share this theme with the community
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={publishTitle}
                    onChange={(e) => setPublishTitle(e.target.value)}
                    placeholder="Theme name..."
                    className="h-8 text-sm rounded-xl flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handlePublishTheme}
                    disabled={!publishTitle.trim() || isPublishing}
                    className="rounded-xl h-8"
                  >
                    {isPublishing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
                    Publish
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
