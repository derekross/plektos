import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-loaded pages: only downloaded when the user navigates to them
const EventDetail = lazy(() => import("@/pages/EventDetail").then(m => ({ default: m.EventDetail })));
const CreateEvent = lazy(() => import("@/pages/CreateEvent").then(m => ({ default: m.CreateEvent })));
const CreateCalendar = lazy(() => import("@/pages/CreateCalendar").then(m => ({ default: m.CreateCalendar })));
const EditCalendar = lazy(() => import("@/pages/EditCalendar").then(m => ({ default: m.EditCalendar })));
const CalendarView = lazy(() => import("@/pages/CalendarView").then(m => ({ default: m.CalendarView })));
const Profile = lazy(() => import("@/pages/Profile").then(m => ({ default: m.Profile })));
const MyTickets = lazy(() => import("@/pages/MyTickets").then(m => ({ default: m.MyTickets })));
const SocialFeed = lazy(() => import("@/pages/SocialFeed").then(m => ({ default: m.SocialFeed })));
const TestNotifications = lazy(() => import("@/pages/TestNotifications").then(m => ({ default: m.TestNotifications })));
const VerifyTicket = lazy(() => import("@/pages/VerifyTicket").then(m => ({ default: m.VerifyTicket })));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicy })));
const RemoteLoginSuccess = lazy(() => import("@/pages/RemoteLoginSuccess").then(m => ({ default: m.RemoteLoginSuccess })));

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
        <Route path="/create-calendar" element={<CreateCalendar />} />
        <Route path="/edit-calendar/:naddr" element={<EditCalendar />} />
        <Route path="/calendar/:naddr" element={<CalendarView />} />
        <Route path="/profile/:npub" element={<Profile />} />
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/feed" element={<SocialFeed />} />
        <Route path="/test-notifications" element={<TestNotifications />} />
        <Route path="/verify-ticket" element={<VerifyTicket />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/remoteloginsuccess" element={<RemoteLoginSuccess />} />
      </Routes>
    </Suspense>
  );
}
