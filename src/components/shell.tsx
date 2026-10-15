"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { matchesStoreRef, storePath, storeSlug } from "@/lib/store-path";
import type { Store } from "@/lib/types";
import { api } from "./api";

type ShellValue = {
  stores: Store[];
  refreshStores: () => Promise<void>;
};

const ShellContext = createContext<ShellValue>({ stores: [], refreshStores: async () => {} });

export function useShell() {
  return useContext(ShellContext);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stores, setStores] = useState<Store[]>([]);
  const [open, setOpen] = useState(false);

  const refreshStores = useCallback(async () => {
    const data = await api<{ stores: Store[] }>("/api/stores");
    setStores(data.stores);
  }, []);

  useEffect(() => {
    refreshStores().catch(() => setStores([]));
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const routeStoreRef = pathname.match(/^\/stores\/([^/]+)/)?.[1] ?? "";
  const current = stores.find((store) => matchesStoreRef(store, routeStoreRef)) ?? stores[0];
  const section = pathname.includes("/reports") ? "reports" : pathname.includes("/analyzer") ? "analyzer" : "dashboard";

  function storeHref(store: Store) {
    if (section === "reports") return storePath(store, "/reports");
    if (section === "analyzer") return storePath(store, "/analyzer");
    return storePath(store);
  }

  const value = useMemo(() => ({ stores, refreshStores }), [stores]);

  return (
    <ShellContext.Provider value={value}>
      <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-navy px-4 py-3 text-white md:hidden">
          <Link href="/" className="font-semibold tracking-tight">
            Store Dashboard
          </Link>
          <button type="button" className="rounded-md border border-white/20 px-3 py-1 text-sm" onClick={() => setOpen((value) => !value)}>
            Menu
          </button>
        </div>
        {open ? <button aria-label="Close menu" className="fixed inset-0 z-30 bg-navy/40 md:hidden" onClick={() => setOpen(false)} /> : null}
        <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-navy text-white transition md:static md:translate-x-0`}>
          <div className="border-b border-white/10 px-5 py-5">
            <p className="text-xs font-semibold tracking-[0.16em] text-sky-200">GOODWILL</p>
            <Link href="/" className="mt-1 block text-lg font-semibold leading-tight">
              Store Dashboard
            </Link>
          </div>
          <div className="px-4 py-4">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-sky-200/80" htmlFor="store-switcher">
              Store
            </label>
            <select
              id="store-switcher"
              className="store-switcher mt-1 w-full rounded-md border border-line bg-white px-2 py-2 text-sm text-ink outline-none"
              value={current ? storeSlug(current) : ""}
              onChange={(event) => {
                const next = stores.find((store) => storeSlug(store) === event.target.value);
                if (next) window.location.href = storeHref(next);
              }}
            >
              {stores.length === 0 ? <option value="">No stores yet</option> : null}
              {stores.map((store) => (
                <option key={store.id} value={storeSlug(store)}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sky-200/70">Overview</p>
            <Nav href="/" label="Store Dashboard" active={pathname === "/"} />
            <Nav href="/stores" label="Store Directory" active={pathname === "/stores"} />
            <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sky-200/70">Selected Store</p>
            {current ? (
              <p className="px-3 pb-1 text-sm text-sky-100/90">
                {current.name} · Store {current.code}
              </p>
            ) : null}
            <Nav href={current ? storePath(current) : "/stores"} label="Performance" active={Boolean(routeStoreRef) && section === "dashboard"} />
            <Nav href={current ? storePath(current, "/reports") : "/stores"} label="Report Sources" active={section === "reports"} />
            <Nav href={current ? storePath(current, "/analyzer") : "/stores"} label="AI Analyzer" active={section === "analyzer"} />
          </nav>
          <p className="px-5 py-4 text-xs leading-5 text-sky-100/70">Prototype. Not connected to Celerant, ADP, or other live systems.</p>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </ShellContext.Provider>
  );
}

function Nav({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-white/15 text-white" : "text-sky-100/85 hover:bg-white/10"}`}>
      {label}
    </Link>
  );
}
