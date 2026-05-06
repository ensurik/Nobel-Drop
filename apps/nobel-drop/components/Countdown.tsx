import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { timeUntil } from "../lib/format";

interface Props {
  to: string; // ISO
  variant?: "compact" | "expanded";
  label?: string;
}

export function Countdown({ to, variant = "compact", label }: Props) {
  const [t, setT] = useState(() => timeUntil(to));

  useEffect(() => {
    const id = setInterval(() => setT(timeUntil(to)), 1000);
    return () => clearInterval(id);
  }, [to]);

  if (t.total <= 0) {
    return <Text className="text-danger font-sans-bold">UTSOLGT</Text>;
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  if (variant === "compact") {
    return (
      <Text className="text-gold font-sans-bold tabular-nums">
        {t.d > 0 ? `${t.d}d ` : ""}
        {pad(t.h)}:{pad(t.m)}:{pad(t.s)}
      </Text>
    );
  }

  return (
    <View className="items-center">
      {label ? <Text className="text-bone-400 text-xs mb-1 uppercase tracking-widest">{label}</Text> : null}
      <View className="flex-row gap-2">
        {[
          ["TIMER", pad(t.h + t.d * 24)],
          ["MIN", pad(t.m)],
          ["SEK", pad(t.s)],
        ].map(([k, v]) => (
          <View key={k} className="bg-ink-800 border border-gold-deep px-3 py-2 rounded-md min-w-[56px] items-center">
            <Text className="text-gold-bright text-2xl font-display tabular-nums">{v}</Text>
            <Text className="text-bone-400 text-[10px] tracking-widest">{k}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
