"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useShell } from "@/components/shell";
import { storeSlug } from "@/lib/store-path";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ storeId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { stores } = useShell();

  useEffect(() => {
    const ref = params.storeId;
    if (!ref || !stores.length) return;
    const byId = stores.find((store) => store.id === ref);
    if (!byId) return;
    const slug = storeSlug(byId);
    if (slug === ref) return;
    router.replace(pathname.replace(`/stores/${ref}`, `/stores/${slug}`));
  }, [params.storeId, pathname, router, stores]);

  return children;
}
