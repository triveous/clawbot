export default async function AssistantDetailPage({
  params,
}: {
  params: Promise<{ assistantId: string }>;
}) {
  const { assistantId } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold">Assistant: {assistantId}</h1>
      <p className="mt-2 text-sm text-gray-400">
        Phase 6: Assistant detail coming soon
      </p>
    </div>
  );
}
