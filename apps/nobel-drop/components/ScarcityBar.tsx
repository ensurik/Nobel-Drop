import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { pct } from "../lib/format";

interface Props {
  remaining: number;
  total: number;
  /** Optional live-stats fra get_drop_stats — endrer beskjeden basert på fart. */
  velocityLabel?: "cold" | "warm" | "hot" | "sold_out";
  soldLast5min?: number;
}

export function ScarcityBar({ remaining, total, velocityLabel, soldLast5min }: Props) {
  const sold = Math.max(0, total - remaining);
  const fillPct = pct(sold, total);
  const isLow = remaining > 0 && remaining < total * 0.2;
  const soldOut = remaining <= 0 || velocityLabel === "sold_out";
  const soldLast5Pct = total > 0 ? Math.round(((soldLast5min ?? 0) / total) * 100) : 0;
  const fill = useSharedValue(fillPct);
  const pulse = useSharedValue(1);
  const previousRemaining = useRef(remaining);

  useEffect(() => {
    fill.value = withTiming(fillPct, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [fill, fillPct]);

  useEffect(() => {
    if (previousRemaining.current !== remaining) {
      pulse.value = withSequence(
        withTiming(1.04, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 180, easing: Easing.inOut(Easing.quad) }),
      );
      previousRemaining.current = remaining;
    }
  }, [remaining, pulse]);

  const message = (() => {
    if (soldOut) return "Utsolgt";
    if (velocityLabel === "hot" && soldLast5Pct > 0) {
      return `Solgte ${soldLast5Pct}% siste 5 min`;
    }
    if (isLow) return `Kun ${remaining} bokser igjen`;
    return `${remaining} bokser igjen`;
  })();

  const accent = soldOut
    ? "text-bone-400"
    : velocityLabel === "hot"
    ? "text-gold-bright"
    : isLow
    ? "text-danger"
    : "text-gold";

  const barColor = soldOut
    ? "bg-ink-600"
    : velocityLabel === "hot"
    ? "bg-gold-bright"
    : isLow
    ? "bg-danger"
    : "bg-gold";

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value}%`,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View className="w-full">
      <Animated.View style={pulseStyle} className="flex-row justify-between items-center mb-1.5">
        <Text className={`text-xs uppercase tracking-widest ${accent}`}>
          {message}
        </Text>
        <Text className="text-bone-400 text-xs tabular-nums">
          {sold}/{total}
        </Text>
      </Animated.View>
      <View className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
        <Animated.View
          className={`h-full ${barColor}`}
          style={fillStyle}
        />
      </View>
    </View>
  );
}
