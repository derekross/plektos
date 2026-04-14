import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEnhancedNostrPublish } from '@/hooks/useEnhancedNostrPublish';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload } from 'lucide-react';
import { NSchema as n, type NostrMetadata } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadFile } from '@/hooks/useUploadFile';
import { ShapePicker } from '@/components/ShapePicker';
import { getAvatarShape } from '@/lib/avatarShapes';

export const EditProfileForm: React.FC = () => {
  const queryClient = useQueryClient();

  const { user, metadata } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useEnhancedNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const [shape, setShape] = useState<string | undefined>(undefined);


  // Initialize the form with default values
  const form = useForm<NostrMetadata>({
    resolver: zodResolver(n.metadata()),
    defaultValues: {
      name: '',
      about: '',
      picture: '',
      banner: '',
      website: '',
      nip05: '',
      lud16: '',
    },
  });

  // Update form values when user data is loaded
  useEffect(() => {
    if (metadata) {
      form.reset({
        name: metadata.name || '',
        about: metadata.about || '',
        picture: metadata.picture || '',
        banner: metadata.banner || '',
        website: metadata.website || '',
        nip05: metadata.nip05 || '',
        lud16: metadata.lud16 || '',
      });
      setShape(getAvatarShape(metadata as Record<string, unknown>));
    }
  }, [metadata, form]);

  // Handle file uploads for profile picture and banner
  const uploadPicture = async (file: File, field: 'picture' | 'banner') => {
    try {
      // The first tuple in the array contains the URL
      const [[_, url]] = await uploadFile(file);
      form.setValue(field, url);
      toast.success(`${field === 'picture' ? 'Profile picture' : 'Banner'} uploaded successfully`);
    } catch (error) {
      console.error(`Failed to upload ${field}:`, error);
      toast.error(`Failed to upload ${field === 'picture' ? 'profile picture' : 'banner'}. Please try again.`);
    }
  };

  const onSubmit = async (values: NostrMetadata) => {
    if (!user) {
      toast.error('You must be logged in to update your profile');
      return;
    }

    try {
      // Combine existing metadata with new values
      const data: Record<string, unknown> = { ...metadata, ...values };

      // Include shape if set, remove if cleared
      if (shape) {
        data.shape = shape;
      } else {
        delete data.shape;
      }

      // Clean up empty values
      for (const key in data) {
        if (data[key] === '') {
          delete data[key];
        }
      }

      // Publish the metadata event (kind 0) to all relays
      await publishEvent({
        kind: 0,
        content: JSON.stringify(data),
      });

      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['logins'] });
      queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['userRelays', user.pubkey] });

      toast.success('Your profile has been updated and broadcasted to your home relays');
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Failed to update your profile. Please try again.');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Your name" {...field} />
              </FormControl>
              <FormDescription>
                This is your display name that will be displayed to others.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="about"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Tell others about yourself" 
                  className="resize-none" 
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                A short description about yourself.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="picture"
            render={({ field }) => (
              <ImageUploadField
                field={field}
                label="Profile Picture"
                placeholder="https://example.com/profile.jpg"
                description="URL to your profile picture. You can upload an image or provide a URL."
                previewType="square"
                onUpload={(file) => uploadPicture(file, 'picture')}
              />
            )}
          />

          <FormField
            control={form.control}
            name="banner"
            render={({ field }) => (
              <ImageUploadField
                field={field}
                label="Banner Image"
                placeholder="https://example.com/banner.jpg"
                description="URL to a wide banner image for your profile. You can upload an image or provide a URL."
                previewType="wide"
                onUpload={(file) => uploadPicture(file, 'banner')}
              />
            )}
          />
        </div>

        <ShapePicker value={shape} onChange={setShape} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input placeholder="https://yourwebsite.com" {...field} />
                </FormControl>
                <FormDescription>
                  Your personal website or social media link.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nip05"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nostr Address</FormLabel>
                <FormControl>
                  <Input placeholder="you@example.com" {...field} />
                </FormControl>
                <FormDescription>
                  Your verified NIP-05 identifier.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="lud16"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lightning Address</FormLabel>
              <FormControl>
                <Input placeholder="you@example.com" {...field} />
              </FormControl>
              <FormDescription>
                Your Lightning address for receiving payments.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button 
          type="submit" 
          className="w-full md:w-auto" 
          disabled={isPending || isUploading}
        >
          {(isPending || isUploading) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save Profile
        </Button>
      </form>
    </Form>
  );
};

// Reusable component for image upload fields
interface ImageUploadFieldProps {
  field: {
    value: string | undefined;
    onChange: (value: string) => void;
    name: string;
    onBlur: () => void;
  };
  label: string;
  placeholder: string;
  description: string;
  previewType: 'square' | 'wide';
  onUpload: (file: File) => void;
}

const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  field,
  label,
  placeholder,
  description,
  previewType,
  onUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <div className="flex flex-col gap-2">
        <FormControl>
          <Input
            placeholder={placeholder}
            name={field.name}
            value={field.value ?? ''}
            onChange={e => field.onChange(e.target.value)}
            onBlur={field.onBlur}
          />
        </FormControl>
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUpload(file);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Image
          </Button>
          {field.value && (
            <div className={`h-10 ${previewType === 'square' ? 'w-10' : 'w-24'} rounded overflow-hidden`}>
              <img 
                src={field.value} 
                alt={`${label} preview`} 
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>
      </div>
      <FormDescription>
        {description}
      </FormDescription>
      <FormMessage />
    </FormItem>
  );
};
