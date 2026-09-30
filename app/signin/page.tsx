import SignInForm from "./SignInForm";
import { safeCallbackUrl } from "@/lib/safeCallbackUrl";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reset?: string }>;
}) {
  const { callbackUrl, reset } = await searchParams;
  return <SignInForm callbackUrl={safeCallbackUrl(callbackUrl)} passwordReset={reset === "1"} />;
}
