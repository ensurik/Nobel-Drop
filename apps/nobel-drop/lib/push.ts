// Klient-side hjelpere for push-registrering.
// Web-versjonen brukes i app/(customer)/account.tsx.
// Native-versjonen importeres fra app som ikke er web (Platform.OS).
import { Platform } from "react-native";
import { supabase } from "./supabase";

export async function registerWebPush(userId: string) {
  if (Platform.OS !== "web") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const reg = await navigator.serviceWorker.register("/sw.js");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY!,
  });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await supabase.from("push_subscriptions").upsert({
    user_id: userId,
    platform: "web",
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
}

export async function registerNativePush(userId: string) {
  if (Platform.OS === "web") return;
  // Native registrering — krever expo-notifications. Se CURSOR.md prompt #6.
  // Kort versjon:
  //   const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  //   await supabase.from("push_subscriptions").upsert({
  //     user_id: userId, platform: Platform.OS as 'ios'|'android', expo_token: token,
  //   });
}
