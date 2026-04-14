import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { OnboardingDialog } from './OnboardingDialog';

// Mock the hooks
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      signer: {
        nip44: {
          encrypt: vi.fn(),
          decrypt: vi.fn(),
        },
      },
    },
  }),
}));

vi.mock('@/hooks/useEnhancedNostrPublish', () => ({
  useEnhancedNostrPublish: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('@/hooks/useUploadFile', () => ({
  useUploadFile: () => ({
    mutateAsync: vi.fn().mockResolvedValue([['url', 'https://example.com/image.jpg']]),
    isPending: false,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn().mockImplementation(() => ({
    invalidateQueries: vi.fn(),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

const mockProps = {
  open: true,
  onOpenChange: vi.fn(),
  onComplete: vi.fn(),
};

describe('OnboardingDialog', () => {
  it('renders the name step initially', () => {
    render(
      <TestApp>
        <OnboardingDialog {...mockProps} />
      </TestApp>
    );

    expect(screen.getByText("What's your name?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
  });

  it('allows navigation through all steps', async () => {
    render(
      <TestApp>
        <OnboardingDialog {...mockProps} />
      </TestApp>
    );

    // Fill in name and proceed
    const nameInput = screen.getByPlaceholderText('Enter your name');
    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Should be on avatar step
    await waitFor(() => {
      expect(screen.getByText('Add a profile picture')).toBeInTheDocument();
    });

    // Proceed to shape step
    const nextButton2 = screen.getByText('Next');
    fireEvent.click(nextButton2);

    // Should be on shape step
    await waitFor(() => {
      expect(screen.getByText('Choose your vibe')).toBeInTheDocument();
    });

    // Proceed to bio step
    const nextButton3 = screen.getByText('Next');
    fireEvent.click(nextButton3);

    // Should be on bio step
    await waitFor(() => {
      expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
    });
  });

  it('validates required name field', () => {
    render(
      <TestApp>
        <OnboardingDialog {...mockProps} />
      </TestApp>
    );

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('shows back button on later steps', async () => {
    render(
      <TestApp>
        <OnboardingDialog {...mockProps} />
      </TestApp>
    );

    // Fill in name and proceed
    const nameInput = screen.getByPlaceholderText('Enter your name');
    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Should be on avatar step with back button
    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });

  it('completes onboarding when profile is created', async () => {
    render(
      <TestApp>
        <OnboardingDialog {...mockProps} />
      </TestApp>
    );

    // Fill in name and proceed through all steps
    const nameInput = screen.getByPlaceholderText('Enter your name');
    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Go to shape step
    await waitFor(() => {
      const nextButton2 = screen.getByText('Next');
      fireEvent.click(nextButton2);
    });

    // Go to bio step
    await waitFor(() => {
      const nextButton3 = screen.getByText('Next');
      fireEvent.click(nextButton3);
    });

    // Go to final step
    await waitFor(() => {
      const createButton = screen.getByText('Create Profile');
      fireEvent.click(createButton);
    });

    // Should call onComplete
    await waitFor(() => {
      expect(mockProps.onComplete).toHaveBeenCalled();
    });
  });
}); 