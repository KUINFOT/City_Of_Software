import { Sidebar } from "./sidebar";

export function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="account-shell">
      <Sidebar />
      <div className="account-content">{children}</div>
    </main>
  );
}
