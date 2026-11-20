import { AuthForm } from "@/app/auth/AuthForm";
import { signIn } from "@/app/auth/actions";

export const metadata = { title: "登入｜Threads Analyzer" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const initialError = sp.error === "verify_failed" ? "驗證連結無效或已過期，請重新登入或註冊" : undefined;
  return <AuthForm mode="login" action={signIn} next={next} initialError={initialError} />;
}
