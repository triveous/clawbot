export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Phase 5: Marketing navbar */}
      <main className="flex-1">{children}</main>
      {/* Phase 5: Marketing footer */}
    </div>
  );
}
