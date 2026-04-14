import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNostrLogin } from '@nostrify/react/login';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

// Storage key must match the one in main.tsx NostrLoginProvider
const LOGINS_STORAGE_KEY = 'plektos-login';

export function RemoteLoginSuccess() {
  const navigate = useNavigate();
  const { logins } = useNostrLogin();
  const [checkCount, setCheckCount] = useState(0);
  const [status, setStatus] = useState<'checking' | 'success' | 'timeout'>('checking');

  // Check localStorage directly as a fallback
  const checkLocalStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(LOGINS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) && parsed.length > 0;
      }
    } catch {
      // Ignore parse errors
    }
    return false;
  }, []);

  // Check if logged in via React state or localStorage
  const isLoggedIn = logins.length > 0 || checkLocalStorage();

  useEffect(() => {
    if (isLoggedIn) {
      setStatus('success');
      const timer = setTimeout(() => {
        // Try to close this tab (works if opened by signer app)
        window.close();
        // Wait briefly to check if close worked before redirecting
        setTimeout(() => {
          if (!window.closed) {
            window.location.href = '/';
          }
        }, 300);
      }, 1500);
      return () => clearTimeout(timer);
    }

    // Check up to 20 times (10 seconds total) for the session to become active
    if (checkCount < 20) {
      const timer = setTimeout(() => {
        setCheckCount(prev => prev + 1);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setStatus('timeout');
    }
  }, [isLoggedIn, checkCount, checkLocalStorage]);

  // Listen for storage events (in case login is added from another context)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LOGINS_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setStatus('success');
            setTimeout(() => {
              window.close();
              setTimeout(() => {
                if (!window.closed) {
                  window.location.href = '/';
                }
              }, 300);
            }, 1500);
          }
        } catch {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        {status === 'checking' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto text-primary animate-spin" />
            <h1 className="text-2xl font-bold">Completing Login...</h1>
            <p className="text-muted-foreground">Verifying your remote signer connection</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
            <h1 className="text-2xl font-bold">Login Successful!</h1>
            <p className="text-muted-foreground">Redirecting you to the app...</p>
          </>
        )}

        {status === 'timeout' && (
          <>
            <XCircle className="w-16 h-16 mx-auto text-yellow-500" />
            <h1 className="text-2xl font-bold">Session Not Detected</h1>
            <p className="text-muted-foreground">The login session wasn't found. This can happen if:</p>
            <ul className="text-muted-foreground text-sm text-left list-disc list-inside space-y-1">
              <li>The signer app didn't complete authorization</li>
              <li>You opened this page in a different browser</li>
              <li>The session expired</li>
            </ul>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
            >
              Go to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default RemoteLoginSuccess;
