import AuthSplit from "@/components/AuthSplit";
import AdminSignInForm from "@/components/AdminSignInForm";
import { safeCallbackUrl } from "@/lib/safeCallbackUrl";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reset?: string }>;
}) {
  const { callbackUrl, reset } = await searchParams;
  return (
    <AuthSplit>
      <AdminSignInForm
        callbackUrl={safeCallbackUrl(callbackUrl)}
        passwordReset={reset === "1"}
        eyebrow="Welcome back"
        heading="Sign in"
        subtext="Manage your workspace, employees, and plan."
        showRegisterLink
      />
    </AuthSplit>
  );
}
