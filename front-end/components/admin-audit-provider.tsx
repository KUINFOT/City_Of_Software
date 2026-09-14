"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { useAuth } from "./auth-provider";

export type AuditCategory = "Accounts" | "Monitoring" | "Adapter health" | "Repository";

export type AuditEvent = {
  id: string;
  category: AuditCategory;
  actor: string;
  action: string;
  target: string;
  time: string;
  details: string;
};

type AuditInput = Omit<AuditEvent, "id" | "time" | "actor"> & { actor?: string };
type AuditContextValue = { events: AuditEvent[]; recordEvent: (event: AuditInput) => void };

const initialEvents: AuditEvent[] = [
  { id: "audit-01", category: "Accounts", actor: "Narin Anurak", action: "Changed role", target: "Pimlada Thepsiri: reviewer → administrator", time: "Today, 14:32", details: "Role updated from reviewer to administrator through Account & Roles." },
  { id: "audit-02", category: "Monitoring", actor: "Narin Anurak", action: "Updated schedule", target: "Sathon District Office: every hour → every 6 hours", time: "Today, 13:18", details: "Agency monitor cadence updated. The next check will use the new schedule." },
  { id: "audit-03", category: "Adapter health", actor: "System", action: "Marked attention required", target: "Pathum Wan District Office adapter", time: "Today, 10:07", details: "Adapter was paused after a source-layout mismatch was detected." },
  { id: "audit-04", category: "Accounts", actor: "Narin Anurak", action: "Prepared invitation", target: "Kanya Somchai as vendor", time: "Yesterday, 16:45", details: "A demo invitation was created; no email was delivered in the frontend prototype." },
];

const AuditContext = createContext<AuditContextValue | null>(null);

export function AdminAuditProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [events, setEvents] = useState(initialEvents);
  const value = useMemo<AuditContextValue>(() => ({
    events,
    recordEvent: (event) => setEvents((current) => [{
      ...event,
      id: `audit-${Date.now()}-${current.length}`,
      actor: event.actor ?? user?.name ?? "System",
      time: "Just now",
    }, ...current]),
  }), [events, user?.name]);

  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export function useAdminAudit() {
  const context = useContext(AuditContext);
  if (!context) throw new Error("useAdminAudit must be used within AdminAuditProvider");
  return context;
}
