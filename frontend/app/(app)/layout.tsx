"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import SidebarUser from "./_components/SidebarUser";
import AuthGate from "./_components/AuthGate";

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-100"
    >
      {label}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Your rule (keep it)
  const hideSidebar = pathname === "/workspaces";

  return (
    <AuthGate>
      <div className="min-h-screen bg-neutral-50">
        {hideSidebar ? (
          <main>{children}</main>
        ) : (
          <div className="flex">
            <aside className="sticky top-0 h-screen w-64 border-r border-neutral-200 bg-white">
              <div className="h-full flex flex-col p-4">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    Decision Ledger
                  </div>

                  <div className="mt-4 space-y-1">
                    <NavItem href="/workspaces" label="Workspaces" />
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  <SidebarUser />
                </div>
              </div>
            </aside>

            <main className="flex-1">
              <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
            </main>
          </div>
        )}
      </div>
    </AuthGate>
  );
}
