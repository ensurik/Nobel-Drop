import { View, ViewProps } from "react-native";

export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View
      {...props}
      className={`bg-ink-800 border border-ink-600 rounded-lg ${className}`}
    />
  );
}

export function CardHeader({ className = "", ...props }: ViewProps & { className?: string }) {
  return <View {...props} className={`p-4 border-b border-ink-600 ${className}`} />;
}

export function CardBody({ className = "", ...props }: ViewProps & { className?: string }) {
  return <View {...props} className={`p-4 ${className}`} />;
}
