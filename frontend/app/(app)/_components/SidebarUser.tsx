"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UiUser = {
  name: string;
  email: string;
  initials: string;
};

function initialsFrom(name: string, email: string) {
  const n = (name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "";
    const b = parts[parts.length - 1]?.[0] ?? "";
    return (a + b).toUpperCase() || "U";
  }
  return (email?.[0] ?? "U").toUpperCase();
}

export default function SidebarUser() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [u, setU] = useState<UiUser | null>(null);

  const displayName = useMemo(() => u?.name || "User", [u]);

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      const user = data.user;
      const name =
        (user?.user_metadata as any)?.name ||
        (user?.user_metadata as any)?.full_name ||
        "";
      const email = user?.email ?? "";

      setU({
        name: name || email || "User",
        email,
        initials: initialsFrom(name, email),
      });
    }

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-user-menu]")) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function logout() {
    setOpen(false);
    setU(null);

    // this clears the session
    await supabase.auth.signOut();
    router.replace("/auth/sign-in");
    router.refresh();

    // no redirect here — AuthGate will catch "no session" and send to /auth/sign-in
  }

  return (
    <div className="relative" data-user-menu>
      {open && (
        <div className="absolute bottom-14 left-0 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          <button
            onClick={logout}
            className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-neutral-50"
          >
            Logout
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-3 hover:bg-neutral-50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
            {u?.initials ?? "U"}
          </div>

          <div className="min-w-0 text-left">
            <div className="text-sm font-medium text-neutral-900 truncate">
              {displayName}
            </div>
            <div className="text-xs text-neutral-500 truncate">
              {u?.email ?? ""}
            </div>
          </div>
        </div>

        <span className="text-neutral-400 text-xs">▾</span>
      </button>
    </div>
  );
}
