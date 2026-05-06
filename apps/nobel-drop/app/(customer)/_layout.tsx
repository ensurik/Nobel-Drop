import { Tabs, Redirect } from "expo-router";
import { useAuth } from "../../lib/auth";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";

export default function CustomerLayout() {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-ink-900">
        <ActivityIndicator color="#C8A24C" />
      </View>
    );
  }

  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0A0A0B" },
        headerTitleStyle: { color: "#F5F2EA", fontFamily: "PlayfairDisplay_700Bold" },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: "#0A0A0B", borderTopColor: "#2A2A33" },
        tabBarActiveTintColor: "#C8A24C",
        tabBarInactiveTintColor: "#8E8B82",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Hjem",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders/index"
        options={{
          title: "Ordrer",
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Konto",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="drop/[id]" options={{ href: null }} />
      <Tabs.Screen name="checkout" options={{ href: null }} />
      <Tabs.Screen name="orders/[id]" options={{ href: null }} />
    </Tabs>
  );
}
