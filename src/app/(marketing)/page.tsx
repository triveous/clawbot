export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-4xl font-bold">
        Welcome to{" "}
        <span className="font-[var(--font-instrument-serif)] italic font-normal">
          Clawbot
        </span>
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        One-Click Personal AI Agents for Everyone
      </p>
      <p className="mt-2 text-sm text-muted-foreground/70">
        Phase 5: Landing page coming soon
      </p>
    </div>
  );
}
