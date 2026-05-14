import { Stack, Redirect } from "expo-router";
import { useAuth } from "../../lib/auth";
import { ActivityIndicator, Platform, View } from "react-native";

export default function AdminLayout() {
  const { loading, profile, session } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-ink-900">
        <ActivityIndicator color="#C8A24C" />
      </View>
    );
  }

  if (!session) return <Redirect href="/auth/login" />;
  if (profile?.role !== "admin") return <Redirect href="/(customer)" />;

  // All admin/backoffice web traffic skal ligge på eget subdomene.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const target = "https://admin.nobeldrop.no/";
    if (window.location.hostname !== "admin.nobeldrop.no") {
      window.location.replace(target);
      return (
        <View className="flex-1 items-center justify-center bg-ink-900">
          <ActivityIndicator color="#C8A24C" />
        </View>
      );
    }
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0A0A0B" },
        headerTitleStyle: { color: "#F5F2EA", fontFamily: "PlayfairDisplay_700Bold" },
        headerTintColor: "#C8A24C",
        headerShadowVisible: false,
        contentStyle: { backgroundColor: "#0A0A0B" },
      }}
    />
  );
}
