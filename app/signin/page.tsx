import SignInForm from "./SignInForm";
import { safeCallbackUrl } from "@/lib/safeCallbackUrl";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return <SignInForm callbackUrl={safeCallbackUrl(callbackUrl)} />;
}
