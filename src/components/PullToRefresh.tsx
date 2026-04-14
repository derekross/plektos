import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
  disabled?: boolean;
}

export function PullToRefresh({ children, onRefresh, disabled = false }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const queryClient = useQueryClient();

  const isNative = Capacitor.isNativePlatform();
  const threshold = 80;
  const maxPull = 120;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || refreshing) return;

    // Only start pull if at top of scroll
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 0) return;

    startYRef.current = e.touches[0].clientY;
    setPulling(true);
  }, [disabled, refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling || disabled || refreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      // Apply resistance
      const distance = Math.min(diff * 0.5, maxPull);
      setPullDistance(distance);

      // Prevent default scroll when pulling down
      if (distance > 10) {
        e.preventDefault();
      }
    }
  }, [pulling, disabled, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;

    setPulling(false);

    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(threshold);

      try {
        if (onRefresh) {
          await onRefresh();
        } else {
          // Invalidate only the main data queries, not the entire cache
          await queryClient.invalidateQueries({ queryKey: ["events"] });
          await queryClient.invalidateQueries({ queryKey: ["followerRSVPs"] });
          await queryClient.invalidateQueries({ queryKey: ["eventRSVPs"] });
        }
      } catch {
        // Refresh failed silently — the user sees the indicator reset
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pulling, pullDistance, refreshing, onRefresh, queryClient]);

  useEffect(() => {
    if (!isNative) return;

    const container = containerRef.current;
    if (!container) return;

    // Attach listeners to the container element, not document,
    // so pull-to-refresh doesn't fire from modals/drawers
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isNative, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Don't render indicator on web
  if (!isNative) {
    return <>{children}</>;
  }

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = pullDistance > 10 || refreshing;

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[100] flex items-center justify-center transition-transform duration-150"
          style={{
            top: `calc(env(safe-area-inset-top, 0px) + 4rem + ${Math.min(pullDistance, threshold)}px - 40px)`,
            opacity: progress,
          }}
        >
          <div className="bg-muted rounded-full p-2 shadow-lg">
            <Loader2
              className={`h-6 w-6 text-primary ${refreshing ? 'animate-spin' : ''}`}
              style={{
                transform: refreshing ? 'none' : `rotate(${progress * 360}deg)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Content with pull transform */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : 'none',
          transition: pulling ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
