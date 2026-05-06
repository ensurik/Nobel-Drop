import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function Callback() {
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/");
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-ink-900">
      <ActivityIndicator color="#C8A24C" />
    </View>
  );
}
