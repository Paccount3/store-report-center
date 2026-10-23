export type SourcePalette = {
  main: string;
  soft: string;
  deep: string;
};

const BLUE: SourcePalette = {
  main: "#0c5eae",
  soft: "#7aa6d4",
  deep: "#06284a",
};

export const SOURCE_COLORS = {
  celerant: BLUE,
  adp: BLUE,
  upright: BLUE,
  workplace: BLUE,
  financial: BLUE,
  other: BLUE,
} as const satisfies Record<string, SourcePalette>;

export function sourceColor(id: string): SourcePalette | null {
  return id in SOURCE_COLORS ? SOURCE_COLORS[id as keyof typeof SOURCE_COLORS] : null;
}
