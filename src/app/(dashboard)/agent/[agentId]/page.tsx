export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold">Agent: {agentId}</h1>
      <p className="mt-2 text-sm text-gray-400">
        Phase 6: Agent detail coming soon
      </p>
    </div>
  );
}
