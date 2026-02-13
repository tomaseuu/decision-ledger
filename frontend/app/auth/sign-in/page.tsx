"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setMsg(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      if (!data.session) {
        setMsg(
          "Signed in, but no session returned. Check Supabase auth settings.",
        );
        return;
      }

      router.replace("/workspaces");
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message ?? "Something went wrong signing in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (loading) return;

    setMsg(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/workspaces`,
        },
      });

      if (error) setMsg(error.message);
    } catch (err: any) {
      setMsg(err?.message ?? "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 hover:opacity-80 transition"
          >
            <div className="h-10 w-10 rounded-lg border border-[#E5E7EB] bg-white flex items-center justify-center font-semibold">
              DL
            </div>
            <span className="text-lg font-semibold text-[#111827]">
              Decision Ledger
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-[#111827] mb-6 text-center">
            Sign In
          </h2>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-[#111827]"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/30"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium text-[#111827]"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E5E7EB]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-[#6B7280]">Or</span>
              </div>
            </div>

            <button
              type="button"
              className="w-full mt-4 rounded-md border border-[#E5E7EB] bg-white py-2.5 text-sm font-medium text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-60"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              Sign in with Google
            </button>
          </div>

          {msg && (
            <p className="mt-4 text-sm text-red-600 text-center">{msg}</p>
          )}

          <p className="mt-6 text-center text-sm text-[#6B7280]">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/sign-up"
              className="text-[#2563EB] hover:underline font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
