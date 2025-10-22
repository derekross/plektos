import { Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { EventDetail } from "@/pages/EventDetail";
import { CreateEvent } from "@/pages/CreateEvent";
import { Profile } from "@/pages/Profile";
import { MyTickets } from "@/pages/MyTickets";
import { SocialFeed } from "@/pages/SocialFeed";
import { TestNotifications } from "@/pages/TestNotifications";
import { VerifyTicket } from "@/pages/VerifyTicket";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/event/:eventId" element={<EventDetail />} />
      <Route path="/create" element={<CreateEvent />} />
      <Route path="/profile/:npub" element={<Profile />} />
      <Route path="/tickets" element={<MyTickets />} />
      <Route path="/feed" element={<SocialFeed />} />
      <Route path="/test-notifications" element={<TestNotifications />} />
      <Route path="/verify-ticket" element={<VerifyTicket />} />
    </Routes>
  );
}
