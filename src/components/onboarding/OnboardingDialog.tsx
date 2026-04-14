import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, User, FileText, Sparkles, ArrowRight, ArrowLeft, Star } from 'lucide-react';
import { ShapePicker } from '@/components/ShapePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useEnhancedNostrPublish } from '@/hooks/useEnhancedNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useQueryClient } from '@tanstack/react-query';
import { genUserName } from '@/lib/genUserName';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be less than 50 characters'),
  about: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  picture: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export const OnboardingDialog: React.FC<OnboardingDialogProps> = ({
  open,
  onOpenChange,
  onComplete,
}) => {
  const [step, setStep] = useState<'name' | 'avatar' | 'shape' | 'bio' | 'publishing'>('name');
  const [isLoading, setIsLoading] = useState(false);
  const [shape, setShape] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useEnhancedNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      about: '',
      picture: '',
    },
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('name');
      setIsLoading(false);
      form.reset();
    }
  }, [open, form]);

  const watchedValues = form.watch();

  const handleImageUpload = async (file: File) => {
    setIsLoading(true);
    try {
      // Upload the file (user should already be logged in)
      const [[_, url]] = await uploadFile(file);
      form.setValue('picture', url);
      toast.success('Profile picture uploaded successfully!');
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = async () => {
    if (step === 'name') {
      const name = form.getValues('name');
      if (!name.trim()) {
        form.setError('name', { message: 'Name is required' });
        return;
      }
      
      setStep('avatar');
    } else if (step === 'avatar') {
      setStep('shape');
    } else if (step === 'shape') {
      setStep('bio');
    } else if (step === 'bio') {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (step === 'avatar') {
      setStep('name');
    } else if (step === 'shape') {
      setStep('avatar');
    } else if (step === 'bio') {
      setStep('shape');
    }
  };

  const handleFinish = async () => {
    if (!user) {
      toast.error('You must be logged in to complete onboarding.');
      return;
    }

    setStep('publishing');
    setIsLoading(true);

    try {
      // Prepare profile data
      const formData = form.getValues();
      const profileData: Record<string, string> = {
        name: formData.name,
        about: formData.about || '',
        picture: formData.picture || '',
      };

      // Include shape if set
      if (shape) {
        profileData.shape = shape;
      }

      // Remove empty values
      Object.keys(profileData).forEach(key => {
        if (!profileData[key]) {
          delete profileData[key];
        }
      });

      // Publish the profile
      await publishEvent({
        kind: 0,
        content: JSON.stringify(profileData),
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['logins'] });
      queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });

      toast.success('🎉 Welcome to Plektos! Your profile has been created.');
      
      // Complete onboarding and close
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create profile:', error);
      toast.error('Failed to create your profile. Please try again.');
      setStep('bio');
    } finally {
      setIsLoading(false);
    }
  };

  const getStepIcon = (currentStep: string) => {
    switch (currentStep) {
      case 'name':
        return <User className="w-8 h-8 text-primary" />;
      case 'avatar':
        return <Camera className="w-8 h-8 text-primary" />;
      case 'shape':
        return <Star className="w-8 h-8 text-primary" />;
      case 'bio':
        return <FileText className="w-8 h-8 text-primary" />;
      case 'publishing':
        return <Sparkles className="w-8 h-8 text-primary animate-pulse" />;
      default:
        return <User className="w-8 h-8 text-primary" />;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'name':
        return "What's your name?";
      case 'avatar':
        return 'Add a profile picture';
      case 'shape':
        return 'Choose your vibe';
      case 'bio':
        return 'Tell us about yourself';
      case 'publishing':
        return 'Creating your profile...';
      default:
        return "Let's get started!";
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'name':
        return 'This is how others will see you on Plektos';
      case 'avatar':
        return 'Help others recognize you (optional)';
      case 'shape':
        return 'Pick an emoji to shape your avatar — make it uniquely you';
      case 'bio':
        return 'Share what makes you unique (optional)';
      case 'publishing':
        return 'Publishing your profile to the network...';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md p-0 overflow-hidden rounded-2xl"
      >
        {/* Close button for users who want to skip onboarding */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 rounded-full p-2 hover:bg-muted transition-colors"
          aria-label="Close onboarding"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center justify-center mb-4">
            {getStepIcon(step)}
          </div>
          <DialogTitle className="text-xl font-semibold text-center">
            {getStepTitle()}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground mt-2">
            {getStepDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-8">
          {/* Progress indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex space-x-2">
              {['name', 'avatar', 'shape', 'bio'].map((stepName, index) => (
                <div
                  key={stepName}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    stepName === step
                      ? 'bg-primary'
                      : ['name', 'avatar', 'shape', 'bio'].indexOf(step) > index
                      ? 'bg-primary/60'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>

          <Form {...form}>
            <form className="space-y-6">
              {step === 'name' && (
                <div className="space-y-4 animate-slide-up">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">Display Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter your name"
                            className="text-lg py-6 rounded-xl border-2 focus:border-primary transition-colors"
                            {...field}
                            autoFocus
                            disabled={isLoading}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-sm text-muted-foreground">
                    You can always change this later in your profile settings.
                  </p>
                </div>
              )}

              {step === 'avatar' && (
                <div className="space-y-6 animate-slide-up">
                  <div className="flex flex-col items-center space-y-4">
                    <Avatar className="w-24 h-24 border-4 border-primary/20">
                      <AvatarImage src={watchedValues.picture} />
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                        {watchedValues.name ? watchedValues.name[0].toUpperCase() : user ? genUserName(user.pubkey)[0] : 'U'}
                      </AvatarFallback>
                    </Avatar>

                    <div className="text-center">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Account ready
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="picture"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormControl>
                            <Input
                              placeholder="Or paste image URL"
                              className="rounded-xl"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleImageUpload(file);
                        }
                      }}
                    />

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-xl py-6"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {isUploading ? 'Uploading...' : 'Upload Photo'}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      You can skip this step and add a photo later in your profile settings
                    </p>
                  </div>
                </div>
              )}

              {step === 'shape' && (
                <div className="space-y-4 animate-slide-up">
                  <ShapePicker value={shape} onChange={setShape} />
                  <p className="text-xs text-muted-foreground text-center">
                    You can skip this step and keep the default circle
                  </p>
                </div>
              )}

              {step === 'bio' && (
                <div className="space-y-4 animate-slide-up">
                  <FormField
                    control={form.control}
                    name="about"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">Bio</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell others about yourself, your interests, or what kind of events you love..."
                            className="min-h-32 rounded-xl border-2 focus:border-primary transition-colors resize-none"
                            {...field}
                            autoFocus
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          {(field.value?.length || 0)}/500 characters
                        </p>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {step === 'publishing' && (
                <div className="flex flex-col items-center space-y-6 py-8">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-lg font-medium">Almost there!</p>
                    <p className="text-sm text-muted-foreground">
                      We're setting up your profile and connecting you to the network.
                    </p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '75%' }} />
                  </div>
                </div>
              )}
            </form>
          </Form>

          {step !== 'publishing' && (
            <div className="flex justify-between mt-8">
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                disabled={step === 'name'}
                className="rounded-xl"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>

              <Button
                type="button"
                onClick={handleNext}
                disabled={isLoading || isUploading}
                className="rounded-xl px-8"
              >
                {step === 'bio' ? 'Create Profile' : 'Next'}
                {step !== 'bio' && <ArrowRight className="w-4 h-4 ml-2" />}
                {step === 'bio' && <Sparkles className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}; 