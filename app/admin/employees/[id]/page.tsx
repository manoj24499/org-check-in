import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EmployeeActions from "@/components/EmployeeActions";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const employee = await prisma.user.findUnique({
    where: { id },
    include: {
      attendances: {
        orderBy: { timestamp: "desc" },
        take: 50,
      },
    },
  });

  if (!employee || employee.role !== "EMPLOYEE") notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">{employee.name}</h1>
        <p className="text-slate-500 mt-1">
          {employee.employeeCode} · {employee.email}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">Credentials</h2>
          <EmployeeActions employeeId={employee.id} active={employee.active} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <h2 className="text-lg font-semibold p-6 pb-0">Recent Activity</h2>
          <table className="w-full text-sm mt-4">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Method</th>
              </tr>
            </thead>
            <tbody>
              {employee.attendances.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    No records yet.
                  </td>
                </tr>
              )}
              {employee.attendances.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(r.timestamp).toLocaleString()}</td>
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
    </div>
  );
}
