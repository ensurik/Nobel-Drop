// Designtokens — brukes både fra TS-kode og synkronisert med Tailwind-config.
export const colors = {
  bg: "#0A0A0B",
  bgElevated: "#15151A",
  bgRaised: "#1F1F26",
  border: "#2A2A33",
  borderBright: "#3A3A44",
  text: "#F5F2EA",
  textDim: "#C9C2AE",
  textMuted: "#8E8B82",
  gold: "#C8A24C",
  goldBright: "#E8C57A",
  goldDim: "#7A6532",
  goldDeep: "#473A1A",
  danger: "#D4503E",
  success: "#5BAE7A",
} as const;

export const radius = { sm: 6, md: 12, lg: 20, xl: 28 };
export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 };
