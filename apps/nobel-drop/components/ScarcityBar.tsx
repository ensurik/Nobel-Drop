import { Text, View } from "react-native";
import { pct } from "../lib/format";

interface Props {
  remaining: number;
  total: number;
}

export function ScarcityBar({ remaining, total }: Props) {
  const sold = total - remaining;
  const fillPct = pct(sold, total);
  const isLow = remaining < total * 0.2;

  return (
    <View className="w-full">
      <View className="flex-row justify-between mb-1">
        <Text className={`text-xs uppercase tracking-widest ${isLow ? "text-danger" : "text-gold"}`}>
          Kun {remaining} bokser igjen
        </Text>
        <Text className="text-bone-400 text-xs tabular-nums">
          {sold}/{total} solgt
        </Text>
      </View>
      <View className="h-2 bg-ink-700 rounded-full overflow-hidden">
        <View
          className={`h-full ${isLow ? "bg-danger" : "bg-gold"}`}
          style={{ width: `${fillPct}%` }}
        />
      </View>
    </View>
  );
}
