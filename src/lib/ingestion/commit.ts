import { DEMO_READONLY_MESSAGE } from "../demo/snapshot";

/** Observation writes are disabled while the app runs from the baked-in demo snapshot. */
export function writeObservations(): never {
  throw new Error(DEMO_READONLY_MESSAGE);
}
