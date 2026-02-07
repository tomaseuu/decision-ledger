"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function Page() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      console.log("SESSION:", data.session);
      console.log("ACCESS TOKEN:", data.session?.access_token);
      console.log("ERROR:", error);
    });
  }, []);

  return <div>Check console</div>;
}
