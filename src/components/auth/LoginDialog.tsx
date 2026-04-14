// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { QRCodeSVG } from 'qrcode.react';
import { Shield, Upload, Loader2, Copy, Check, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import {
  useLoginActions,
  generateNostrConnectParams,
  generateNostrConnectURI,
  type NostrConnectParams,
} from '@/hooks/useLoginActions';
import { useIsMobile } from '@/hooks/useIsMobile';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignup?: () => void;
}

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin, onSignup }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [nostrConnectParams, setNostrConnectParams] = useState<NostrConnectParams | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string>('');
  const [isWaitingForConnect, setIsWaitingForConnect] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showBunkerInput, setShowBunkerInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const login = useLoginActions();

  // Check if running in native app (Capacitor) or mobile browser
  const isNative = Capacitor.isNativePlatform();
  const isMobile = useIsMobile();
  // Show signer app button on native OR mobile web (where users may have Amber etc installed)
  const showSignerAppButton = isNative || isMobile;
  // Extension only available on web when window.nostr exists
  const hasExtension = !isNative && 'nostr' in window;

  // Generate nostrconnect params (sync) - just creates the QR code data
  const generateConnectSession = useCallback(() => {
    const relayUrl = login.getRelayUrl();
    const params = generateNostrConnectParams([relayUrl]);
    const uri = generateNostrConnectURI(params, 'Plektos');
    setNostrConnectParams(params);
    setNostrConnectUri(uri);
    setConnectError(null);
  }, [login]);

  // Start listening for connection (async) - runs after params are set
  useEffect(() => {
    if (!nostrConnectParams || isWaitingForConnect) return;

    const startListening = async () => {
      setIsWaitingForConnect(true);
      abortControllerRef.current = new AbortController();

      try {
        await login.nostrconnect(nostrConnectParams);
        onLogin();
        onClose();
      } catch (error) {
        console.error('Nostrconnect failed:', error);
        setConnectError(error instanceof Error ? error.message : 'Connection failed');
        setIsWaitingForConnect(false);
      }
    };

    startListening();
  }, [nostrConnectParams, login, onLogin, onClose, isWaitingForConnect]);

  // Clean up on close, or generate session when opening on native
  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      setNostrConnectParams(null);
      setNostrConnectUri('');
      setIsWaitingForConnect(false);
      setConnectError(null);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      prevIsOpenRef.current = false;
    } else if (!prevIsOpenRef.current) {
      // Dialog just opened — generate session if connect tab will be the default
      prevIsOpenRef.current = true;
      if (!hasExtension) {
        generateConnectSession();
      }
    }
  }, [isOpen, hasExtension, generateConnectSession]);

  // Retry connection with new params
  const handleRetry = useCallback(() => {
    setNostrConnectParams(null);
    setNostrConnectUri('');
    setIsWaitingForConnect(false);
    setConnectError(null);
    // Generate new session after state clears
    setTimeout(() => generateConnectSession(), 0);
  }, [generateConnectSession]);

  const handleCopyUri = async () => {
    await navigator.clipboard.writeText(nostrConnectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Open the nostrconnect URI in the system - this will launch a signer app like Amber if installed
  const handleOpenSignerApp = () => {
    if (!nostrConnectUri) return;
    // On Android/iOS, this will trigger the system to find an app that handles nostrconnect:// URIs
    window.location.href = nostrConnectUri;
  };

  const handleExtensionLogin = () => {
    setIsLoading(true);
    try {
      if (!('nostr' in window)) {
        throw new Error('Nostr extension not found. Please install a NIP-07 extension.');
      }
      login.extension();
      onLogin();
      onClose();
    } catch (error) {
      console.error('Extension login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyLogin = () => {
    if (!nsec.trim()) return;
    setIsLoading(true);

    try {
      login.nsec(nsec);
      onLogin();
      onClose();
    } catch (error) {
      console.error('Nsec login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBunkerLogin = () => {
    if (!bunkerUri.trim()) return;
    if (!bunkerUri.startsWith('bunker://') && !bunkerUri.startsWith('nostrconnect://')) return;
    setIsLoading(true);

    try {
      login.bunker(bunkerUri);
      onLogin();
      onClose();
    } catch (error) {
      console.error('Bunker login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setNsec(content.trim());
    };
    reader.readAsText(file);
  };

  const handleSignupClick = () => {
    onClose();
    if (onSignup) {
      onSignup();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-md p-0 overflow-hidden rounded-2xl'>
        <DialogHeader className='px-6 pt-6 pb-0 relative'>
          <DialogTitle className='text-xl font-semibold text-center'>Welcome back!</DialogTitle>
          <DialogDescription className='text-center text-muted-foreground mt-2'>
            Ready to discover amazing events and connect with your community?
          </DialogDescription>
        </DialogHeader>

        <div className='px-6 py-8 space-y-6'>
          <Tabs
            defaultValue={hasExtension ? 'extension' : 'connect'}
            className='w-full'
            onValueChange={(value) => {
              if (value === 'connect' && !nostrConnectParams && !connectError) {
                generateConnectSession();
              }
            }}
          >
            <TabsList className={`grid mb-6 ${hasExtension ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {hasExtension && <TabsTrigger value='extension'>Extension</TabsTrigger>}
              <TabsTrigger value='connect'>Connect</TabsTrigger>
              <TabsTrigger value='key'>Nsec</TabsTrigger>
            </TabsList>

            {hasExtension && (
              <TabsContent value='extension' className='space-y-4'>
                <div className='text-center p-6 rounded-2xl bg-primary/10'>
                  <Shield className='w-12 h-12 mx-auto mb-3 text-primary' />
                  <p className='text-sm text-muted-foreground mb-4'>
                    Login with one click using your browser extension
                  </p>
                  <Button
                    className='w-full rounded-2xl py-6 font-medium'
                    onClick={handleExtensionLogin}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Logging in...' : 'Login with Extension'}
                  </Button>
                </div>
              </TabsContent>
            )}

            <TabsContent value='key' className='space-y-4'>
              <div className='space-y-4'>
                <div className='space-y-2'>
                  <label htmlFor='nsec' className='text-sm font-medium'>
                    Enter your nsec
                  </label>
                  <Input
                    type='password'
                    id='nsec'
                    value={nsec}
                    onChange={(e) => setNsec(e.target.value)}
                    className='rounded-xl border-2 focus:border-primary transition-colors'
                    placeholder='nsec1...'
                  />
                </div>

                <div className='text-center'>
                  <p className='text-sm mb-2 text-muted-foreground'>Or upload a key file</p>
                  <input
                    type='file'
                    accept='.txt'
                    className='hidden'
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant='outline'
                    className='w-full rounded-xl'
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className='w-4 h-4 mr-2' />
                    Upload Nsec File
                  </Button>
                </div>

                <Button
                  className='w-full rounded-2xl py-6 mt-4 font-medium'
                  onClick={handleKeyLogin}
                  disabled={isLoading || !nsec.trim()}
                >
                  {isLoading ? 'Verifying...' : 'Login with Nsec'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value='connect' className='space-y-4'>
              {/* Nostrconnect Section */}
              <div className='flex flex-col items-center space-y-4'>
                {connectError ? (
                  <div className='flex flex-col items-center space-y-4 py-4'>
                    <p className='text-sm text-red-500 text-center'>{connectError}</p>
                    <Button variant='outline' onClick={handleRetry}>
                      Try Again
                    </Button>
                  </div>
                ) : nostrConnectUri ? (
                  <>
                    {/* QR Code - only show on desktop web */}
                    {!showSignerAppButton && (
                      <div className='p-4 bg-white rounded-xl'>
                        <QRCodeSVG
                          value={nostrConnectUri}
                          size={180}
                          level='M'
                          includeMargin={false}
                        />
                      </div>
                    )}

                    {/* Status message */}
                    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                      {isWaitingForConnect ? (
                        <>
                          <Loader2 className='w-4 h-4 animate-spin' />
                          <span>Waiting for connection...</span>
                        </>
                      ) : (
                        <span>{showSignerAppButton ? 'Open your signer app to connect' : 'Scan with your signer app'}</span>
                      )}
                    </div>

                    {/* Open Signer App button - primary action on native and mobile web */}
                    {showSignerAppButton && (
                      <Button
                        className='w-full gap-2 py-6 rounded-2xl'
                        onClick={handleOpenSignerApp}
                      >
                        <ExternalLink className='w-5 h-5' />
                        Open Signer App
                      </Button>
                    )}

                    {/* Copy button */}
                    <Button
                      variant='outline'
                      size={showSignerAppButton ? 'default' : 'sm'}
                      className={showSignerAppButton ? 'w-full gap-2 rounded-2xl' : 'gap-2'}
                      onClick={handleCopyUri}
                    >
                      {copied ? (
                        <>
                          <Check className='w-4 h-4' />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className='w-4 h-4' />
                          Copy Connection String
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <div className='flex items-center justify-center h-[100px]'>
                    <Loader2 className='w-8 h-8 animate-spin text-muted-foreground' />
                  </div>
                )}
              </div>

              {/* Manual URI input section - collapsible */}
              <div className='pt-4 border-t'>
                <button
                  type='button'
                  onClick={() => setShowBunkerInput(!showBunkerInput)}
                  className='flex items-center justify-center gap-2 w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2'
                >
                  <span>Manual bunker connection</span>
                  {showBunkerInput ? (
                    <ChevronUp className='w-4 h-4' />
                  ) : (
                    <ChevronDown className='w-4 h-4' />
                  )}
                </button>

                {showBunkerInput && (
                  <div className='space-y-3 mt-3'>
                    <div className='space-y-2'>
                      <Input
                        id='bunkerUri'
                        value={bunkerUri}
                        onChange={(e) => setBunkerUri(e.target.value)}
                        className='rounded-xl border-2 focus:border-primary transition-colors text-sm'
                        placeholder='bunker://'
                      />
                      {bunkerUri && !bunkerUri.startsWith('bunker://') && !bunkerUri.startsWith('nostrconnect://') && (
                        <p className='text-red-500 text-xs'>URI must start with bunker:// or nostrconnect://</p>
                      )}
                    </div>

                    <Button
                      className='w-full rounded-2xl py-4 font-medium'
                      variant='outline'
                      onClick={handleBunkerLogin}
                      disabled={isLoading || !bunkerUri.trim() || (!bunkerUri.startsWith('bunker://') && !bunkerUri.startsWith('nostrconnect://'))}
                    >
                      {isLoading ? 'Connecting...' : 'Connect with Bunker'}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className='text-center text-sm'>
            <p className='text-muted-foreground mb-3'>
              New to Plektos?
            </p>
            <Button
              variant="outline"
              onClick={handleSignupClick}
              className='w-full rounded-2xl py-3 font-medium border-2 hover:border-primary/50 transition-all duration-200'
            >
              Create an account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
