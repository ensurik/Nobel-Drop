import { Pressable, Text, ActivityIndicator, View } from "react-native";

interface Props {
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-gold border border-gold-bright",
  secondary: "bg-ink-700 border border-ink-600",
  ghost: "bg-transparent border border-ink-600",
  danger: "bg-danger border border-danger",
};

const TEXT_VARIANTS: Record<NonNullable<Props["variant"]>, string> = {
  primary: "text-ink-900 font-sans-bold",
  secondary: "text-bone-100 font-sans-medium",
  ghost: "text-bone-100 font-sans-medium",
  danger: "text-bone-100 font-sans-bold",
};

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "px-3 py-2",
  md: "px-5 py-3",
  lg: "px-6 py-4",
};

const TEXT_SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

export function Button({
  onPress, variant = "primary", size = "md", loading, disabled, children, fullWidth,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={[
        "rounded-md items-center justify-center",
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? "w-full" : "",
        disabled || loading ? "opacity-50" : "",
      ].join(" ")}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#0A0A0B" : "#F5F2EA"} />
      ) : (
        <View>
          <Text className={`${TEXT_VARIANTS[variant]} ${TEXT_SIZES[size]} tracking-wide`}>
            {children as React.ReactNode}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
