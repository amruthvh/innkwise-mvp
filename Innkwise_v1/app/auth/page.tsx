"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { storeAuthToken } from "@/lib/auth-client";

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

  useEffect(() => {
    axios
      .get<Record<string, unknown>>("/api/auth/providers")
      .then((res) => setGoogleEnabled(Boolean(res.data?.google)))
      .catch(() => setGoogleEnabled(false));
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
      router.push("/dashboard");
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

  const handleGoogleSignIn = async () => {
    if (!googleEnabled) {
      setError("Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.");
      return;
    }

    try {
      setGoogleLoading(true);
      setError("");
      setAuthSuccess("");
      await signIn("google", { callbackUrl: "/dashboard" });
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

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-[#0b1020]/90 px-5 py-8 shadow-[0_20px_70px_rgba(15,23,42,0.35)] sm:px-8 sm:py-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-6 flex justify-center">
            <div className="flex items-center gap-3 text-sm font-semibold tracking-[0.24em] text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
                IN
              </span>
              <span>Innkwise</span>
            </div>
          </div>

          {view === "forgot" ? (
            <div className="space-y-8">
              <div className="space-y-4 text-center">
                <h1 className="text-4xl font-semibold tracking-tight text-white">
                  Reset Your Password
                </h1>
                <p className="mx-auto max-w-lg text-xl leading-9 text-slate-300">
                  Enter the email address or phone number that is associated with your account and
                  then we will send you the instructions on how to reset your password.
                </p>
                <p className="mx-auto max-w-lg text-base leading-7 text-slate-400">
                  If you use Google to sign in, password recovery and account recovery are handled
                  directly by Google.
                </p>
              </div>

              <div className="space-y-6">
                <input
                  type="text"
                  value={forgotIdentifier}
                  onChange={(e) => {
                    setForgotIdentifier(e.target.value);
                    setError("");
                    setForgotSuccess("");
                    setDevResetLink("");
                  }}
                  placeholder="Enter your email or phone number"
                  className="h-16 w-full rounded-2xl border border-white/10 bg-[#11182b] px-5 text-2xl text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-400/50"
                />

                {error ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-base text-red-200">
                    {error}
                  </div>
                ) : null}

                {forgotSuccess ? (
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-4 text-base text-cyan-100">
                    <p>{forgotSuccess}</p>
                    {devResetLink ? (
                      <a
                        href={devResetLink}
                        className="mt-3 inline-block break-all font-medium text-cyan-200 underline underline-offset-4 hover:text-white"
                      >
                        {devResetLink}
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="h-16 w-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 text-2xl font-semibold text-slate-950 transition hover:from-cyan-300 hover:to-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Continue"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setView("auth");
                    setError("");
                    setForgotSuccess("");
                    setDevResetLink("");
                  }}
                  className="h-16 w-full rounded-full border border-cyan-300/20 bg-[#1a2440] text-2xl font-semibold text-cyan-100 transition hover:bg-[#243056]"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-6">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={!googleEnabled || googleLoading || status === "loading"}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-[#11182b] px-5 text-lg font-semibold text-white transition hover:border-cyan-400/40 hover:bg-[#151f37] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <GoogleMark />
                  <span>{googleButtonLabel}</span>
                </button>

                <div className="flex items-center gap-4 text-sm uppercase tracking-[0.28em] text-slate-500">
                  <span className="h-px flex-1 bg-white/10" />
                  <span>Or continue with password</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <label className="block space-y-3">
                  <span className="text-xl font-medium text-white sm:text-2xl">
                    {identifierLabel}
                  </span>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      setError("");
                      setAuthSuccess("");
                    }}
                    placeholder={identifierPlaceholder}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-[#11182b] px-5 text-xl text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-400/50"
                  />
                </label>

                <div className="space-y-3">
                  <span className="block text-xl font-medium text-white sm:text-2xl">
                    Password
                  </span>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                        setAuthSuccess("");
                      }}
                      placeholder={passwordPlaceholder}
                      className="h-14 w-full rounded-2xl border border-white/10 bg-[#11182b] px-5 pr-16 text-xl text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-400/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 transition hover:text-cyan-300"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-8 w-8" /> : <Eye className="h-8 w-8" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between gap-4 text-sm text-slate-400 sm:text-xl">
                  <p className="max-w-sm leading-6 text-slate-400">
                    Google sign-in uses Google for authentication and account recovery.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setView("forgot");
                      setError("");
                      setAuthSuccess("");
                      setForgotSuccess("");
                      setDevResetLink("");
                    }}
                    className="shrink-0 font-medium text-cyan-300 transition hover:text-cyan-200"
                  >
                    Forgot password?
                  </button>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-base text-red-200">
                    {error}
                  </div>
                ) : null}

                {authSuccess ? (
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-4 text-base text-cyan-100">
                    {authSuccess}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={loading || !identifier.trim() || password.trim().length < 6}
                  className="h-14 w-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 text-xl font-semibold text-slate-950 transition hover:from-cyan-300 hover:to-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {buttonLabel}
                </button>

                <p className="text-center text-lg text-cyan-300">
                  {accessMode === "signin" ? "Don't Have An Account? " : "Already Have An Account? "}
                  <button
                    type="button"
                    onClick={() => {
                      setAccessMode((current) => (current === "signin" ? "signup" : "signin"));
                      setError("");
                      setAuthSuccess("");
                      setPassword("");
                    }}
                    className="font-medium underline underline-offset-4 hover:text-cyan-200"
                  >
                    {accessMode === "signin" ? "Sign Up" : "Sign In"}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
