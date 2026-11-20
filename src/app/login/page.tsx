import { AuthForm } from "@/app/auth/AuthForm";
import { signIn } from "@/app/auth/actions";
import { LOGIN_ERRORS } from "@/lib/oauth";
import { getEnabledProviders } from "@/lib/oauth-server";

export const metadata = { title: "登入｜Threads Analyzer" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const code = typeof sp.error === "string" ? sp.error : undefined;
  const initialError = code && code !== "account_deleted" ? LOGIN_ERRORS[code] : undefined;
  const notice = code === "account_deleted" ? LOGIN_ERRORS.account_deleted : undefined;
  return (
    <AuthForm
      mode="login"
      action={signIn}
      next={next}
      initialError={initialError}
      notice={notice}
      providers={await getEnabledProviders()}
    />
  );
}
