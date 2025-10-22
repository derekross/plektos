import { Link, useLocation } from "react-router-dom";
import { Search, Plus, Ticket, User, Heart, QrCode } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { LoginArea } from "@/components/auth/LoginArea";

import { NotificationBell } from "@/components/NotificationBell";
import LoginDialog from "@/components/auth/LoginDialog";
import { OnboardingDialog } from "@/components/onboarding";
import { useOnboarding } from "@/hooks/useOnboarding";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

interface AppNavigationProps {
  children: React.ReactNode;
}

export function AppNavigation({ children }: AppNavigationProps) {
  const { user } = useCurrentUser();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { shouldShowOnboarding, completeOnboarding, markUserAsInteracted } = useOnboarding();

  // Debug: Log mobile detection
  console.log('AppNavigation: isMobile =', isMobile, 'window.innerWidth =', typeof window !== 'undefined' ? window.innerWidth : 'undefined');

  const handleDiscoverClick = (e: React.MouseEvent) => {
    if (location.pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleLogin = () => {
    setLoginDialogOpen(false);
  };

  const navigationItems = [
    {
      href: "/",
      label: "Discover",
      icon: Search,
      isActive: location.pathname === "/",
      onClick: handleDiscoverClick,
    },
    {
      href: "/feed",
      label: "Feed",
      icon: Heart,
      isActive: location.pathname === "/feed",
      requireAuth: true,
    },
    {
      href: "/create",
      label: "Create",
      icon: Plus,
      isActive: location.pathname === "/create",
      requireAuth: true,
    },
    {
      href: "/tickets",
      label: "Tickets",
      icon: Ticket,
      isActive: location.pathname === "/tickets",
      requireAuth: true,
    },
    {
      href: "/verify-ticket",
      label: "Verify Tickets",
      icon: QrCode,
      isActive: location.pathname === "/verify-ticket",
      requireAuth: true,
    },
  ];

  // Desktop sidebar navigation
  const DesktopSidebar = () => (
    <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
      <SidebarHeader className="border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3 group">
          <div className="relative">
            <img src="/icon.svg" alt="Plektos" className="h-10 w-10 transition-transform group-hover:scale-110" />
            <div className="absolute -inset-1 bg-party-gradient rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur-sm" />
          </div>
          <span className="font-bold text-xl bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Plektos
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="p-4 space-y-2">
          {navigationItems.map((item) => {
            if (item.requireAuth && !user) return null;

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton 
                  asChild 
                  isActive={item.isActive} 
                  size="lg"
                  className={cn(
                    "rounded-2xl transition-all duration-200 hover:scale-105",
                    item.isActive && "bg-primary/15 text-primary"
                  )}
                >
                  <Link to={item.href} onClick={item.onClick}>
                    <item.icon className={cn(
                      "!h-6 !w-6 !min-h-6 !min-w-6 transition-transform",
                      item.isActive && "animate-bounce-gentle"
                    )} />
                    <span className="text-base font-medium">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>


        {/* Account section */}
        <div className="mt-auto p-4 border-t border-border/50">
          <LoginArea className="flex w-full" />
        </div>
      </SidebarContent>
    </Sidebar>
  );

  // Mobile bottom navigation
  const MobileBottomNav = () => {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border/50 md:hidden safe-area-bottom">
        <nav className="flex items-center h-16 px-2">
          {/* Create a grid-like layout for even spacing */}
          <div className="flex items-center justify-between w-full">
            {navigationItems.map((item) => {
              if (item.requireAuth && !user) return null;

              return (
                <Button
                  key={item.href}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 h-12 w-12 p-0 rounded-xl touch-target transition-all duration-200",
                    item.isActive 
                      ? "text-primary bg-primary/15 scale-105" 
                      : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                  )}
                  asChild
                >
                  <Link to={item.href} onClick={item.onClick}>
                    <item.icon className={cn(
                      "!h-5 !w-5 !min-h-5 !min-w-5 transition-transform",
                      item.isActive && "animate-bounce-gentle"
                    )} />
                    <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                  </Link>
                </Button>
              );
            })}


            {/* User/Account button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex flex-col items-center justify-center gap-0.5 h-12 w-12 p-0 rounded-xl touch-target text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200"
                >
                  <User className="!h-5 !w-5 !min-h-5 !min-w-5" />
                  <span className="text-[10px] font-medium leading-tight">Profile</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mb-2 rounded-2xl">
                <div className="md:hidden">
                  <LoginArea className="flex w-full" />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </div>
    );
  };

  return (
    <>
      {isMobile ? (
        // Mobile layout - no sidebar, just content with bottom nav
        <div className="min-h-screen bg-background pb-16">
          {/* Mobile header */}
          <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 safe-area-top">
            <div className="container flex h-16 items-center justify-between">
              <Link to="/" className="flex items-center space-x-3 group">
                <div className="relative">
                  <img src="/icon.svg" alt="Plektos" className="h-10 w-10 transition-transform group-hover:scale-110" />
                  <div className="absolute -inset-1 bg-party-gradient rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur-sm" />
                </div>
                <span className="font-bold text-xl bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Plektos
                </span>
              </Link>
              {user && (
                <div className="flex items-center space-x-2">
                  <NotificationBell className="!h-6 !w-6 text-muted-foreground hover:text-primary transition-colors" />
                </div>
              )}
            </div>
          </header>

          <main className="container py-6 animate-slide-up">{children}</main>
          <MobileBottomNav />
        </div>
      ) : (
        // Desktop layout with sidebar
        <SidebarProvider defaultOpen={true}>
          <div className="flex min-h-screen w-full">
            <DesktopSidebar />
            <div className="flex-1">
              {/* Desktop header */}
              <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-end">
                  {/* Search or other header content can go here */}
                  <div className="flex items-center space-x-3">
                    {user && <NotificationBell className="!h-6 !w-6 text-muted-foreground hover:text-primary transition-colors" />}
                  </div>
                </div>
              </header>

              <main className="container py-6 animate-slide-up">{children}</main>
            </div>
          </div>
        </SidebarProvider>
      )}

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
        onSignup={() => {}} // No-op since LoginArea handles signup
      />

      {/* Onboarding Dialog */}
      <OnboardingDialog
        open={shouldShowOnboarding}
        onOpenChange={(open) => {
          if (!open) {
            // If user closes onboarding, mark them as having interacted
            // so they don't see it again
            markUserAsInteracted();
          }
        }}
        onComplete={completeOnboarding}
      />
    </>
  );
}
