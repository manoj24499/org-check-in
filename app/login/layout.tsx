import Providers from "@/components/Providers";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
