import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-loaded pages: only downloaded when the user navigates to them
const EventDetail = lazy(() => import("@/pages/EventDetail").then(m => ({ default: m.EventDetail })));
const CreateEvent = lazy(() => import("@/pages/CreateEvent").then(m => ({ default: m.CreateEvent })));
const Profile = lazy(() => import("@/pages/Profile").then(m => ({ default: m.Profile })));
const MyTickets = lazy(() => import("@/pages/MyTickets").then(m => ({ default: m.MyTickets })));
const SocialFeed = lazy(() => import("@/pages/SocialFeed").then(m => ({ default: m.SocialFeed })));
const TestNotifications = lazy(() => import("@/pages/TestNotifications").then(m => ({ default: m.TestNotifications })));
const VerifyTicket = lazy(() => import("@/pages/VerifyTicket").then(m => ({ default: m.VerifyTicket })));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicy })));
const RemoteLoginSuccess = lazy(() => import("@/pages/RemoteLoginSuccess").then(m => ({ default: m.RemoteLoginSuccess })));
const PrivateEventDetail = lazy(() => import("@/pages/PrivateEventDetail").then(m => ({ default: m.PrivateEventDetail })));
const InviteLanding = lazy(() => import("@/pages/InviteLanding").then(m => ({ default: m.InviteLanding })));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="container mx-auto p-4 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export default function AppRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/event/:eventId" element={<EventDetail />} />
        <Route path="/create" element={<CreateEvent />} />
        <Route path="/profile/:npub" element={<Profile />} />
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/feed" element={<SocialFeed />} />
        <Route path="/test-notifications" element={<TestNotifications />} />
        <Route path="/verify-ticket" element={<VerifyTicket />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/remoteloginsuccess" element={<RemoteLoginSuccess />} />
        {/*
          Private events. A separate route tree, not a branch inside
          /event/:eventId — a private event has no naddr and no public
          identity, and keeping it off the public page is what makes the
          share/comment/zap paths structurally unreachable for it.
          Both are static-prefixed, so they outrank the bare-NIP-19 catch-all.
        */}
        <Route path="/private/:channelId" element={<PrivateEventDetail />} />
        <Route path="/invite/:naddr" element={<InviteLanding />} />
        {/* Support bare NIP-19 identifiers (naddr1..., nevent1..., note1...) as top-level URLs */}
        <Route path="/:eventId" element={<EventDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
