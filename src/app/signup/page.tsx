import { AuthForm } from "@/app/auth/AuthForm";
import { signUp } from "@/app/auth/actions";

export const metadata = { title: "註冊｜Threads Analyzer" };

export default function SignupPage() {
  return <AuthForm mode="signup" action={signUp} />;
}
