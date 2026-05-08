// Magic-link callback er ikke lenger i bruk (telefon+passord auth gir umiddelbar
// session). Vi beholder ruten som en rein redirect for å unngå broken links
// fra eldre lenker eller eksterne referanser.
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";

export default function Callback() {
  useEffect(() => {
    router.replace("/");
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-ink-900">
      <ActivityIndicator color="#C8A24C" />
    </View>
  );
}
