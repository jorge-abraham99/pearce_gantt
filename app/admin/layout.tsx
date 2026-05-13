// Admin pages share the root AppNav — no extra layout wrapper needed.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
