import AuthSplit from "@/components/AuthSplit";
import AdminSignInForm from "@/components/AdminSignInForm";
import { safeCallbackUrl } from "@/lib/safeCallbackUrl";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <AuthSplit>
      <AdminSignInForm
        callbackUrl={safeCallbackUrl(callbackUrl)}
        eyebrow="Admin sign-in"
        heading="Admin login"
        subtext="Restricted to workspace administrators."
        backHref="/login"
      />
    </AuthSplit>
  );
}
