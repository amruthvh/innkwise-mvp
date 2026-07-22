"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { BrandLockup, PointMark } from "@/frontend/components/innkwise-brand";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams?.get("token") ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!token) {
      setError("Reset token is missing.");
      return;
    }

    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post("/api/auth/reset-password", { token, password });
      setSuccess(typeof res.data?.message === "string" ? res.data.message : "Password reset successfully.");
      setTimeout(() => router.push("/auth"), 1200);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          typeof err.response?.data?.error === "string"
            ? err.response.data.error
            : "Unable to reset password right now."
        );
      } else {
        setError("Unable to reset password right now.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = "h-14 w-full rounded-xl border border-black/[0.12] bg-white/45 px-4 pr-12 text-base text-[#0a0b0b] outline-none transition placeholder:text-[#929791] hover:border-black/25 focus:border-black/35 focus:bg-white/70 focus:shadow-none";

  return (
    <main className="min-h-screen bg-[#f1efe9] px-5 py-6 text-[#0a0b0b] sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between">
        <a href="https://innkwise.com" aria-label="Visit Innkwise"><BrandLockup /></a>
        <a href="/auth" className="text-sm text-[#686d68] hover:text-[#0a0b0b]">Return to sign in</a>
      </div>

      <div className="mx-auto flex min-h-[calc(100svh-7rem)] max-w-[1200px] items-center justify-center py-16">
        <div className="w-full max-w-[500px]">
          <PointMark className="h-12 w-12 text-[#687364]" />
          <p className="mt-8 text-[10px] font-medium uppercase tracking-[0.18em] text-[#747974]">Account security</p>
          <h1 className="mt-5 text-4xl font-medium tracking-[-0.05em] sm:text-5xl">Choose a new password.</h1>
          <p className="mt-4 text-lg leading-8 text-[#686d68]">Create a secure password, then return to the work waiting for you in Innkwise.</p>

          <form className="mt-9 space-y-5" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
            <label className="block text-sm font-medium">
              New password
              <span className="relative mt-2 block">
                <input required minLength={6} type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className={fieldClass} />
                <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#747974] hover:text-[#0a0b0b]" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </span>
            </label>

            <label className="block text-sm font-medium">
              Confirm password
              <span className="relative mt-2 block">
                <input required minLength={6} type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your new password" className={fieldClass} />
                <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#747974] hover:text-[#0a0b0b]" aria-label={showConfirmPassword ? "Hide password" : "Show password"}>{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </span>
            </label>

            {error ? <div role="alert" className="rounded-xl border border-[#9f4b45]/25 bg-[#f1d9d6] px-4 py-3 text-sm text-[#71352f]">{error}</div> : null}
            {success ? <div role="status" className="rounded-xl border border-[#71806d]/25 bg-[#d4ddcf]/70 px-4 py-3 text-sm text-[#354032]">{success}</div> : null}

            <button type="submit" disabled={loading} className="group flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0a0b0b] px-6 text-sm font-medium text-[#f1efe9] transition-colors hover:bg-[#282b28] disabled:cursor-wait disabled:opacity-50">
              {loading ? "Updating password..." : "Update password"}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f1efe9] px-5 text-[#0a0b0b]">
          <div className="text-center">
            <PointMark className="mx-auto h-12 w-12 animate-pulse text-[#687364]" />
            <p className="mt-5 text-sm text-[#686d68]">Preparing password recovery…</p>
          </div>
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
