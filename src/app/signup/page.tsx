import { AuthForm } from "@/app/auth/AuthForm";
import { signUp } from "@/app/auth/actions";
import { getEnabledProviders } from "@/lib/oauth-server";

export const metadata = { title: "註冊｜Threads Analyzer" };

export default async function SignupPage() {
  return <AuthForm mode="signup" action={signUp} providers={await getEnabledProviders()} />;
}
