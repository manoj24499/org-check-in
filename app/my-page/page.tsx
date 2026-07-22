import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const session = await auth();
  if (!session) return null;

  const records = await prisma.attendance.findMany({
    where: { userId: session.user.id },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  const last = records[0];
  const isIn = last?.type === "CHECK_IN";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Current status</p>
          <p className="text-xl font-semibold mt-1">
            {last ? (isIn ? "Checked In" : "Checked Out") : "No activity yet"}
          </p>
        </div>
        <span
          className={`w-3 h-3 rounded-full ${
            isIn ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Method</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No records yet. Use the kiosk to check in.
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{new Date(r.timestamp).toLocaleDateString()}</td>
                <td className="px-4 py-3">{new Date(r.timestamp).toLocaleTimeString()}</td>
                <td className="px-4 py-3">
                  {r.type === "CHECK_IN" ? "Check In" : "Check Out"}
                </td>
                <td className="px-4 py-3 text-slate-500">{r.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
