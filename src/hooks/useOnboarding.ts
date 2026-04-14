import { useEffect, useRef, useMemo } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { useAuthor } from './useAuthor';

export interface OnboardingState {
  hasCompletedOnboarding: boolean;
  currentStep: number;
  skippedSteps: number[];
}

const defaultOnboardingState: OnboardingState = {
  hasCompletedOnboarding: false,
  currentStep: 0,
  skippedSteps: [],
};

export function useOnboarding() {
  const { user } = useCurrentUser();
  const previousUserRef = useRef<string | undefined>();
  
  // Check if user has an existing profile
  const authorQuery = useAuthor(user?.pubkey || '');
  const hasExistingProfile = authorQuery.data?.metadata && (
    authorQuery.data.metadata.name || 
    authorQuery.data.metadata.display_name || 
    authorQuery.data.metadata.about
  );

  // Create stable keys that don't change during the session
  const onboardingKey = useMemo(() => `plektos-onboarding-${user?.pubkey || 'default'}`, [user?.pubkey]);
  const interactionKey = useMemo(() => `plektos-user-interacted-${user?.pubkey || 'default'}`, [user?.pubkey]);

  // Get onboarding state from localStorage
  const getOnboardingState = (): OnboardingState => {
    try {
      const stored = localStorage.getItem(onboardingKey);
      return stored ? JSON.parse(stored) : defaultOnboardingState;
    } catch {
      return defaultOnboardingState;
    }
  };

  // Set onboarding state to localStorage
  const setOnboardingState = (state: OnboardingState) => {
    try {
      localStorage.setItem(onboardingKey, JSON.stringify(state));
    } catch {
      // Silently fail if storage is unavailable
    }
  };

  // Get user interaction state from localStorage
  const getUserHasInteracted = (): boolean => {
    try {
      const stored = localStorage.getItem(interactionKey);
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  };

  // Set user interaction state to localStorage
  const setUserHasInteracted = (hasInteracted: boolean) => {
    try {
      localStorage.setItem(interactionKey, JSON.stringify(hasInteracted));
    } catch {
      // Silently fail if storage is unavailable
    }
  };

  // Handle migration when user logs in (from 'default' to user-specific keys)
  useEffect(() => {
    const currentUserPubkey = user?.pubkey;
    const previousUserPubkey = previousUserRef.current;

    // If user just logged in (went from undefined to having a pubkey)
    if (!previousUserPubkey && currentUserPubkey) {
      const defaultOnboardingKey = 'plektos-onboarding-default';
      const defaultInteractionKey = 'plektos-user-interacted-default';

      // Check if there's data in the default keys
      const defaultOnboardingData = localStorage.getItem(defaultOnboardingKey);
      const defaultInteractionData = localStorage.getItem(defaultInteractionKey);

      if (defaultOnboardingData) {
        try {
          // Only migrate if the user-specific key doesn't already have data
          const userSpecificData = localStorage.getItem(onboardingKey);
          if (!userSpecificData) {
            localStorage.setItem(onboardingKey, defaultOnboardingData);
          }
        } catch {
          // Silently fail
        }
      }

      if (defaultInteractionData) {
        try {
          // Only migrate if the user-specific key doesn't already have data
          const userSpecificData = localStorage.getItem(interactionKey);
          if (!userSpecificData) {
            localStorage.setItem(interactionKey, defaultInteractionData);
          }
        } catch {
          // Silently fail
        }
      }
    }

    // Update the ref for next time
    previousUserRef.current = currentUserPubkey;
  }, [user?.pubkey, onboardingKey, interactionKey]);

  const completeOnboarding = () => {
    const currentState = getOnboardingState();
    setOnboardingState({
      ...currentState,
      hasCompletedOnboarding: true,
    });
    // Mark that this user has interacted with the app
    setUserHasInteracted(true);
  };

  const nextStep = () => {
    const currentState = getOnboardingState();
    setOnboardingState({
      ...currentState,
      currentStep: currentState.currentStep + 1,
    });
  };

  const previousStep = () => {
    const currentState = getOnboardingState();
    setOnboardingState({
      ...currentState,
      currentStep: Math.max(0, currentState.currentStep - 1),
    });
  };

  const skipStep = (stepIndex: number) => {
    const currentState = getOnboardingState();
    setOnboardingState({
      ...currentState,
      skippedSteps: [...currentState.skippedSteps, stepIndex],
      currentStep: currentState.currentStep + 1,
    });
    // Mark that this user has interacted with the app
    setUserHasInteracted(true);
  };

  const resetOnboarding = () => {
    setOnboardingState(defaultOnboardingState);
    setUserHasInteracted(false);
  };

  const markUserAsInteracted = () => {
    setUserHasInteracted(true);
  };

  // Get current state
  const onboardingState = getOnboardingState();
  const userHasInteracted = getUserHasInteracted();

  // Auto-complete onboarding for users with existing profiles
  useEffect(() => {
    if (user && hasExistingProfile && !onboardingState.hasCompletedOnboarding) {
      completeOnboarding();
    }
  }, [user, hasExistingProfile, onboardingState.hasCompletedOnboarding]);

  // Determine if we should show onboarding - check localStorage and existing profiles
  const shouldShowOnboarding = (() => {
    // Must have a user to show onboarding
    if (!user) return false;

    // If user has completed onboarding, never show it again
    if (onboardingState.hasCompletedOnboarding) return false;

    // If user has an existing profile, don't show onboarding
    if (hasExistingProfile) return false;

    // If this user has already interacted with the app meaningfully, don't show onboarding
    if (userHasInteracted) return false;

    // For new users who haven't completed onboarding or interacted, show onboarding
    return true;
  })();

  return {
    onboardingState,
    shouldShowOnboarding,
    completeOnboarding,
    nextStep,
    previousStep,
    skipStep,
    resetOnboarding,
    markUserAsInteracted,
    userHasInteracted,
  };
} 