"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { storeAuthToken } from "@/frontend/auth/auth-token-storage";
import { BrandLockup, PointMark } from "@/frontend/components/innkwise-brand";

type ContinueResponse = {
  token: string;
  isNewUser: boolean;
  user: {
    id: string;
    email: string;
    planType: string;
    contactLabel?: string;
  };
};

type ForgotPasswordResponse = {
  message?: string;
  resetLink?: string;
};

type AccessMode = "signup" | "signin";
type AuthView = "auth" | "forgot";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.7 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.6 12 2.6A9.4 9.4 0 0 0 2.6 12c0 5.2 4.2 9.4 9.4 9.4 5.4 0 9-3.8 9-9.1 0-.6-.1-1.1-.2-1.6H12Z" />
      <path fill="#34A853" d="M2.6 7.7l3.2 2.3c.9-2.5 3.3-4.3 6.2-4.3 1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.6 12 2.6c-3.6 0-6.8 2.1-8.3 5.1Z" />
      <path fill="#FBBC05" d="M12 21.4c2.5 0 4.6-.8 6.1-2.2l-2.8-2.3c-.8.5-1.8.8-3.3.8-3.5 0-5.2-2.4-5.4-3.8l-3.2 2.4c1.5 3 4.6 5.1 8.6 5.1Z" />
      <path fill="#4285F4" d="M21 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.4c-.3 1.2-1 2.2-2.1 2.9l2.8 2.3c1.6-1.5 2.9-4 2.9-7.5Z" />
    </svg>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [accessMode, setAccessMode] = useState<AccessMode>("signin");
  const [view, setView] = useState<AuthView>("auth");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [devResetLink, setDevResetLink] = useState("");
  const getReturnTo = () => {
    if (typeof window === "undefined") return "/dashboard";
    const value = new URL(window.location.href).searchParams.get("returnTo");
    return value?.startsWith("/") ? value : "/dashboard";
  };

  useEffect(() => {
    axios
      .get<Record<string, unknown>>("/api/auth/providers")
      .then((res) => setGoogleEnabled(Boolean(res.data?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const requestedMode = params.get("mode");
    const requestedEmail = params.get("email");

    if (requestedMode === "signup" || requestedMode === "create") {
      setAccessMode("signup");
    }
    if (requestedEmail) {
      setIdentifier(requestedEmail);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.appAuthToken) {
      return;
    }

    storeAuthToken(session.appAuthToken);
  }, [session, status]);

  const handleContinue = async () => {
    try {
      setLoading(true);
      setError("");
      setAuthSuccess("");

      const res = await axios.post<ContinueResponse>("/api/auth/continue", {
        identifier,
        password,
        accessMode
      });

      if (accessMode === "signup") {
        setAccessMode("signin");
        setPassword("");
        setShowPassword(false);
        setAuthSuccess("Account created successfully. Please sign in with your email or phone number and password.");
        return;
      }

      storeAuthToken(res.data.token);
      router.push(getReturnTo());
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          typeof err.response?.data?.error === "string"
            ? err.response.data.error
            : "Unable to continue right now."
        );
      } else {
        setError("Unable to continue right now.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || !identifier.trim() || password.trim().length < 6) return;
    void handleContinue();
  };

  const handleGoogleSignIn = async () => {
    if (!googleEnabled) {
      setError("Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.");
      return;
    }

    try {
      setGoogleLoading(true);
      setError("");
      setAuthSuccess("");
      await signIn("google", { callbackUrl: getReturnTo() });
    } catch {
      setError("Unable to start Google sign-in right now.");
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setForgotSuccess("");
    setDevResetLink("");

    if (!forgotIdentifier.trim()) {
      setError("Please enter your email address or phone number.");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post<ForgotPasswordResponse>("/api/auth/forgot-password", {
        identifier: forgotIdentifier
      });

      setForgotSuccess(
        typeof res.data?.message === "string"
          ? res.data.message
          : "Reset instructions were prepared successfully."
      );
      setDevResetLink(typeof res.data?.resetLink === "string" ? res.data.resetLink : "");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          typeof err.response?.data?.error === "string"
            ? err.response.data.error
            : "Unable to send reset instructions right now."
        );
      } else {
        setError("Unable to send reset instructions right now.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    void handleForgotPassword();
  };

  const identifierLabel = "Email or Phone Number";
  const identifierPlaceholder = "Enter your email or phone number";
  const passwordPlaceholder =
    accessMode === "signin" ? "Enter your password" : "Create your password";
  const buttonLabel = loading ? "Continuing..." : "Continue";
  const googleButtonLabel = !googleEnabled
    ? "Google sign-in needs Google env keys"
    : googleLoading
      ? "Connecting to Google..."
      : "Continue with Google";

  const fieldClass = "h-14 w-full rounded-xl border border-black/[0.12] bg-white/45 px-4 text-base text-[#0a0b0b] outline-none transition placeholder:text-[#929791] hover:border-black/25 focus:border-black/35 focus:bg-white/70 focus:shadow-none";

  return (
    <main className="min-h-screen bg-[#f1efe9] text-[#0a0b0b]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden overflow-hidden border-r border-black/[0.08] bg-[#d4ddcf] p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div aria-hidden="true" className="absolute -left-36 top-1/2 h-[34rem] w-[34rem] -translate-y-1/2 rounded-full border border-black/[0.08]" />
          <div aria-hidden="true" className="absolute -left-20 top-1/2 h-[22rem] w-[22rem] -translate-y-1/2 rounded-full border border-black/[0.08]" />
          <a href="https://innkwise.com" aria-label="Visit Innkwise" className="relative w-fit"><BrandLockup /></a>
          <div className="relative max-w-xl">
            <PointMark className="mb-10 h-14 w-14" />
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#626b5f]">Your creative home</p>
            <h1 className="mt-6 text-5xl font-medium leading-[0.98] tracking-[-0.055em] xl:text-7xl">Return to the work that matters.</h1>
            <p className="mt-7 max-w-md text-lg leading-8 text-[#50574e]">Your ideas, creative memory, source material, and projects stay connected—ready when you are.</p>
          </div>
          <p className="relative max-w-sm text-sm leading-6 text-[#677064]">One thoughtful workspace from research to publishing.</p>
        </section>

        <section className="flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:px-16 lg:py-10">
          <div className="flex items-center justify-between lg:justify-end">
            <a href="https://innkwise.com" aria-label="Visit Innkwise" className="lg:hidden"><BrandLockup compact /></a>
            <a href="https://innkwise.com" className="text-sm text-[#686d68] transition-colors hover:text-[#0a0b0b]">Back to website</a>
          </div>

          <div className="flex flex-1 items-center justify-center py-12">
            <div className="w-full max-w-[470px]">
              {view === "forgot" ? (
                <form onSubmit={handleForgotSubmit}>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#747974]">Account recovery</p>
                  <h1 className="mt-5 text-4xl font-medium tracking-[-0.05em] sm:text-5xl">Find your way back.</h1>
                  <p className="mt-4 text-lg leading-8 text-[#686d68]">Enter the email address or phone number connected to your account. We&apos;ll prepare the next step.</p>

                  <label className="mt-9 block text-sm font-medium">
                    Email or phone number
                    <input
                      required
                      type="text"
                      autoComplete="username"
                      value={forgotIdentifier}
                      onChange={(e) => {
                        setForgotIdentifier(e.target.value);
                        setError("");
                        setForgotSuccess("");
                        setDevResetLink("");
                      }}
                      placeholder="you@example.com"
                      className={`${fieldClass} mt-2`}
                    />
                  </label>

                  {error ? <div role="alert" className="mt-5 rounded-xl border border-[#9f4b45]/25 bg-[#f1d9d6] px-4 py-3 text-sm text-[#71352f]">{error}</div> : null}
                  {forgotSuccess ? (
                    <div role="status" className="mt-5 rounded-xl border border-[#71806d]/25 bg-[#d4ddcf]/70 px-4 py-3 text-sm text-[#354032]">
                      <p>{forgotSuccess}</p>
                      {devResetLink ? <a href={devResetLink} className="mt-3 inline-block break-all font-medium underline underline-offset-4">Open development reset link</a> : null}
                    </div>
                  ) : null}

                  <button type="submit" disabled={loading} className="group mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0a0b0b] px-6 text-sm font-medium text-[#f1efe9] transition-colors hover:bg-[#282b28] disabled:cursor-wait disabled:opacity-50">
                    {loading ? "Sending instructions..." : "Continue"}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setView("auth");
                      setError("");
                      setForgotSuccess("");
                      setDevResetLink("");
                    }}
                    className="mt-3 h-14 w-full rounded-full border border-black/[0.12] text-sm font-medium text-[#555a55] hover:bg-white/45 hover:text-[#0a0b0b]"
                  >
                    Return to sign in
                  </button>
                  <p className="mt-6 text-center text-xs leading-5 text-[#7b807a]">Google account recovery is handled directly by Google.</p>
                </form>
              ) : (
                <>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#747974]">Secure access</p>
                  <h1 className="mt-5 text-4xl font-medium tracking-[-0.05em] sm:text-5xl">{accessMode === "signin" ? "Welcome back." : "Begin with an idea."}</h1>
                  <p className="mt-4 text-lg leading-8 text-[#686d68]">{accessMode === "signin" ? "Sign in to continue your creative practice." : "Create your Innkwise account and give your ideas one intelligent home."}</p>

                  <div className="mt-8 grid grid-cols-2 rounded-full border border-black/[0.1] p-1">
                    <button type="button" onClick={() => setAccessMode("signin")} className={`rounded-full px-4 py-2.5 text-sm transition-colors ${accessMode === "signin" ? "bg-[#0a0b0b] text-[#f1efe9]" : "text-[#686d68] hover:text-[#0a0b0b]"}`}>Sign in</button>
                    <button type="button" onClick={() => setAccessMode("signup")} className={`rounded-full px-4 py-2.5 text-sm transition-colors ${accessMode === "signup" ? "bg-[#0a0b0b] text-[#f1efe9]" : "text-[#686d68] hover:text-[#0a0b0b]"}`}>Create account</button>
                  </div>

                  <form className="mt-7 space-y-5" onSubmit={handleAuthSubmit}>
                    <button type="button" onClick={handleGoogleSignIn} disabled={!googleEnabled || googleLoading} className="flex h-14 w-full items-center justify-center gap-3 rounded-full border border-black/[0.12] bg-white/35 px-5 text-sm font-medium transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50">
                      <GoogleMark />
                      <span>{googleButtonLabel}</span>
                    </button>

                    <div className="flex items-center gap-4"><span className="h-px flex-1 bg-black/[0.09]" /><span className="text-[10px] uppercase tracking-[0.14em] text-[#8b908a]">or use password</span><span className="h-px flex-1 bg-black/[0.09]" /></div>

                    <label className="block text-sm font-medium">
                      {identifierLabel}
                      <input required type="text" autoComplete="username" value={identifier} onChange={(e) => { setIdentifier(e.target.value); setError(""); setAuthSuccess(""); }} placeholder={identifierPlaceholder} className={`${fieldClass} mt-2`} />
                    </label>

                    <label className="block text-sm font-medium">
                      Password
                      <span className="relative mt-2 block">
                        <input required minLength={6} type={showPassword ? "text" : "password"} autoComplete={accessMode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); setAuthSuccess(""); }} placeholder={passwordPlaceholder} className={`${fieldClass} pr-12`} />
                        <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#747974] hover:text-[#0a0b0b]" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                      </span>
                    </label>

                    {accessMode === "signin" ? (
                      <div className="flex justify-end"><button type="button" onClick={() => { setView("forgot"); setError(""); setAuthSuccess(""); setForgotSuccess(""); setDevResetLink(""); }} className="text-sm text-[#555a55] hover:text-[#0a0b0b]">Forgot password?</button></div>
                    ) : null}

                    {error ? <div role="alert" className="rounded-xl border border-[#9f4b45]/25 bg-[#f1d9d6] px-4 py-3 text-sm text-[#71352f]">{error}</div> : null}
                    {authSuccess ? <div role="status" className="rounded-xl border border-[#71806d]/25 bg-[#d4ddcf]/70 px-4 py-3 text-sm text-[#354032]">{authSuccess}</div> : null}

                    <button type="submit" disabled={loading || !identifier.trim() || password.trim().length < 6} className="group flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0a0b0b] px-6 text-sm font-medium text-[#f1efe9] transition-colors hover:bg-[#282b28] disabled:cursor-wait disabled:opacity-50">
                      {buttonLabel}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </form>

                  <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs leading-5 text-[#7b807a]"><LockKeyhole className="h-3.5 w-3.5" />Your account stays private and secure.</p>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-center gap-5 text-xs text-[#7b807a]">
            <a href="https://innkwise.com/privacy" className="hover:text-[#0a0b0b]">Privacy</a>
            <a href="https://innkwise.com/terms" className="hover:text-[#0a0b0b]">Terms</a>
            <a href="https://innkwise.com/contact" className="hover:text-[#0a0b0b]">Contact</a>
          </div>
        </section>
      </div>
    </main>
  );
}
