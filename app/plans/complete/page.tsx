import PlanChangeCompleteClient from "./PlanChangeCompleteClient";

export default async function PlanChangeCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; cancelled?: string }>;
}) {
  const { ref, cancelled } = await searchParams;
  return <PlanChangeCompleteClient checkoutRef={ref ?? null} initiallyCancelled={cancelled === "1"} />;
}
