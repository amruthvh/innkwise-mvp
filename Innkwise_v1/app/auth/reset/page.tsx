"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";

export default function ResetPasswordPage() {
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

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl rounded-[2.5rem] border border-white/10 bg-[#0b1020]/90 px-6 py-10 shadow-[0_20px_70px_rgba(15,23,42,0.35)] sm:px-10 sm:py-14">
        <div className="mx-auto max-w-xl space-y-8">
          <div className="space-y-4 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-white">Set New Password</h1>
            <p className="mx-auto max-w-lg text-xl leading-9 text-slate-300">
              Choose a new password for your Innkwise account and continue back into Nexora.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <span className="block text-2xl font-medium text-white sm:text-[2rem]">
                New Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your new password"
                  className="h-16 w-full rounded-2xl border border-white/10 bg-[#11182b] px-5 pr-16 text-2xl text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-400/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 transition hover:text-cyan-300"
                >
                  {showPassword ? <EyeOff className="h-8 w-8" /> : <Eye className="h-8 w-8" />}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <span className="block text-2xl font-medium text-white sm:text-[2rem]">
                Confirm Password
              </span>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  className="h-16 w-full rounded-2xl border border-white/10 bg-[#11182b] px-5 pr-16 text-2xl text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-400/50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 transition hover:text-cyan-300"
                >
                  {showConfirmPassword ? <EyeOff className="h-8 w-8" /> : <Eye className="h-8 w-8" />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-base text-red-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-4 text-base text-cyan-100">
                {success}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="h-16 w-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 text-2xl font-semibold text-slate-950 transition hover:from-cyan-300 hover:to-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
