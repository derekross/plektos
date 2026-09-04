import { useState, useRef, useEffect } from "react";
import { X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBlossomUpload } from "@/hooks/useBlossomUpload";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
}

export function ImageUpload({ value, onChange }: ImageUploadProps) {
  const [uploadTab, setUploadTab] = useState<"upload" | "url">("upload");
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useBlossomUpload();

  const handleFileSelect = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    try {
      const result = await uploadFile(file);
      onChange(result.url);
      setPreviewUrl(result.previewUrl);
    } catch (error) {
      // Error handling is done in the hook
      console.error("Upload failed:", error);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const removeImage = () => {
    onChange("");
    setPreviewUrl("");
  };

  // Update preview URL when value changes
  useEffect(() => {
    if (value) {
      setPreviewUrl(value);
    }
  }, [value]);

  const handleBoxClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={uploadTab}
        onValueChange={(v) => setUploadTab(v as "upload" | "url")}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload" className="text-xs sm:text-sm">Upload</TabsTrigger>
          <TabsTrigger value="url" className="text-xs sm:text-sm">URL</TabsTrigger>
        </TabsList>
        <TabsContent value="upload">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer transition-colors",
              dragOver && "border-primary bg-primary/5",
              isUploading && "opacity-50 cursor-not-allowed"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleBoxClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleBoxClick();
              }
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept="image/*"
              className="hidden"
              disabled={isUploading}
            />
            <div className="space-y-2 sm:space-y-4">
              <div className="flex justify-center">
                <ImageIcon className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground" />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {isUploading ? (
                    "Uploading..."
                  ) : (
                    <>
                      <span className="hidden sm:inline">Drag and drop your image here, or click to browse</span>
                      <span className="sm:hidden">Tap to select image</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Max: 10MB
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="url">
          <div className="space-y-4">
            <div>
              <Label htmlFor="imageUrl" className="text-sm">Image URL</Label>
              <Input
                id="imageUrl"
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                  setPreviewUrl(e.target.value);
                }}
                placeholder="https://..."
                className="text-xs sm:text-sm"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Image Preview */}
      {(previewUrl || value) && (
        <Card>
          <CardContent className="p-4">
            <div className="relative max-w-full">
              <img
                src={previewUrl || value}
                alt="Preview"
                className="object-contain w-full max-w-full max-h-[300px] sm:max-h-[400px] rounded-md"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={removeImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
