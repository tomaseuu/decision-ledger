"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type GateState = "checking" | "authed" | "guest";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let alive = true;

    async function check() {
      // Never guard /auth routes
      if (pathname.startsWith("/auth")) {
        if (alive) setState("authed"); // means "let the page render"
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (!data.session) {
        setState("guest");
        router.replace("/auth/sign-in");
        return;
      }

      setState("authed");
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!alive) return;

      if (!session) {
        setState("guest");
        router.replace("/auth/sign-in");
      } else {
        setState("authed");
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  return <>{children}</>;
}
