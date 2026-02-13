"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Clock, GitBranch } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function LandingPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      setAuthed(!!data.session);
      setChecking(false);
    }

    checkSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setAuthed(!!session);
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    setAuthed(false);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      {/* Header */}
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg border border-[#E5E7EB] bg-white flex items-center justify-center">
              <FileText className="h-5 w-5 text-[#111827]" />
            </div>
            <span className="text-lg font-semibold text-[#111827]">
              Decision Ledger
            </span>
          </div>

          {/* Top-right actions */}
          {checking ? (
            <div className="h-9 w-24 rounded-md bg-neutral-200 animate-pulse" />
          ) : authed ? (
            <button
              onClick={logout}
              className="rounded-md border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] hover:bg-[#F3F4F6]"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/auth/sign-in"
              className="rounded-md border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] hover:bg-[#F3F4F6]"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-8 py-20">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-5xl font-bold text-[#111827] leading-tight">
            Track engineering decisions with <br />
            context.
          </h1>

          <p className="text-xl text-[#6B7280] max-w-2xl mx-auto">
            Log what was decided, why it was decided, and how it changed.
          </p>

          <div className="flex gap-4 justify-center pt-4">
            {checking ? (
              <div className="h-11 w-56 rounded-md bg-neutral-200 animate-pulse" />
            ) : authed ? (
              <button
                onClick={() => router.push("/workspaces")}
                className="rounded-md bg-[#2563EB] px-10 py-3 text-white text-sm font-medium hover:bg-[#1D4ED8]"
              >
                Go to your workspaces
              </button>
            ) : (
              <>
                <Link
                  href="/auth/sign-up"
                  className="rounded-md bg-[#2563EB] px-8 py-3 text-white text-sm font-medium hover:bg-[#1D4ED8]"
                >
                  Get Started
                </Link>

                <Link
                  href="/auth/sign-in"
                  className="rounded-md border border-[#E5E7EB] bg-white px-8 py-3 text-sm font-medium text-[#111827] hover:bg-[#F3F4F6]"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-[#2563EB] bg-opacity-10 rounded-lg flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6 text-[#2563EB]" />
            </div>
            <h3 className="text-lg font-semibold text-[#111827]">
              Log decisions
            </h3>
            <p className="text-sm text-[#6B7280]">
              Capture important engineering decisions with full context and
              reasoning.
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-[#2563EB] bg-opacity-10 rounded-lg flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6 text-[#2563EB]" />
            </div>
            <h3 className="text-lg font-semibold text-[#111827]">
              Capture reasoning
            </h3>
            <p className="text-sm text-[#6B7280]">
              Document the "why" behind decisions, including options considered
              and trade-offs.
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-[#2563EB] bg-opacity-10 rounded-lg flex items-center justify-center mx-auto">
              <GitBranch className="w-6 h-6 text-[#2563EB]" />
            </div>
            <h3 className="text-lg font-semibold text-[#111827]">
              Track revisions
            </h3>
            <p className="text-sm text-[#6B7280]">
              See how decisions evolved over time with automatic revision
              history.
            </p>
          </div>
        </div>

        {/* Tagline */}
        <div className="text-center mt-20 pt-12 border-t border-[#E5E7EB]">
          <p className="text-sm text-[#6B7280] italic">
            Where teams store decisions, not tasks.
          </p>
        </div>
      </main>
    </div>
  );
}
