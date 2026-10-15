import { DEMO_READONLY_MESSAGE, demoStore, demoStores } from "./demo/snapshot";
import { matchesStoreRef } from "./store-path";
import type { Store } from "./types";

export function dataDir() {
  return "";
}

export function listStores(): Store[] {
  return demoStores();
}

/** Resolve a store by UUID or URL slug (store name). */
export function getStore(idOrSlug: string) {
  if (!idOrSlug) return null;
  return demoStore(idOrSlug) ?? listStores().find((store) => matchesStoreRef(store, idOrSlug)) ?? null;
}

export function createStore(_input: {
  name: string;
  code: string;
  city?: string;
  region?: string;
  squareFeet?: number | null;
}): never {
  throw new Error(DEMO_READONLY_MESSAGE);
}

export function updateStore(
  _id: string,
  _input: { name?: string; code?: string; city?: string; region?: string; squareFeet?: number | null },
): null {
  throw new Error(DEMO_READONLY_MESSAGE);
}

export function deleteStore(_id: string): never {
  throw new Error(DEMO_READONLY_MESSAGE);
}
