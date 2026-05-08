// Telefon-normalisering til E.164.
// Aksepterer norske nummer i flere formater og normaliserer til +47XXXXXXXX.
// Returnerer null for ugyldig input.

export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-()._]/g, "");
  if (!cleaned) return null;

  // Allerede +<countrycode><number>
  if (cleaned.startsWith("+")) {
    if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
    return null;
  }

  // 00<countrycode><number>
  if (cleaned.startsWith("00")) {
    const e164 = "+" + cleaned.slice(2);
    if (/^\+\d{8,15}$/.test(e164)) return e164;
    return null;
  }

  // 47XXXXXXXX
  if (cleaned.startsWith("47") && cleaned.length === 10 && /^\d+$/.test(cleaned)) {
    return "+" + cleaned;
  }

  // XXXXXXXX (norsk uten landskode, 8 sifre)
  if (/^\d{8}$/.test(cleaned)) {
    return "+47" + cleaned;
  }

  return null;
}

// Visuell formattering av et lagret E.164-nummer.
// +4798765432 → +47 98 76 54 32
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) return `+${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
  return e164;
}
