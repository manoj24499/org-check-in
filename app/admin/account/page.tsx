import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import ChangeAdminPasswordForm from "@/components/ChangeAdminPasswordForm";
import { Card, Page, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") notFound();

  return (
    <Page>
      <PageHeader eyebrow="Account" title="Change password" subtitle={session.user.email ?? "Your administrator account"} />
      <Card className="p-5">
        <ChangeAdminPasswordForm />
      </Card>
    </Page>
  );
}
