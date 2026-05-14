import { Redirect } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { useAuth } from "../lib/auth";

export default function Index() {
  const { loading, profile } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-ink-900">
        <ActivityIndicator color="#C8A24C" />
      </View>
    );
  }

  if (profile?.role === "admin") {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.replace("https://admin.nobeldrop.no/");
      return (
        <View className="flex-1 items-center justify-center bg-ink-900">
          <ActivityIndicator color="#C8A24C" />
        </View>
      );
    }
    return <Redirect href="/(admin)" />;
  }
  if (profile?.role === "driver") return <Redirect href="/(pickup)" />;
  return <Redirect href="/(customer)" />;
}
