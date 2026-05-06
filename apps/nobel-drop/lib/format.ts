export const oreToKr = (ore: number) => ore / 100;

export const formatNok = (ore: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(ore / 100);

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" }).format(new Date(iso));

export function timeUntil(iso: string): { d: number; h: number; m: number; s: number; total: number } {
  const total = Math.max(0, new Date(iso).getTime() - Date.now());
  const s = Math.floor(total / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    total,
  };
}

export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}
