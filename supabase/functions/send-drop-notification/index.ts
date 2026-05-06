// =====================================================================
// send-drop-notification
// Sender web push + Expo push til alle brukere med push_enabled.
// Kalles manuelt fra admin når et drop går live, eller scheduled.
// POST body: { drop_id: uuid, title?, body?, action_url? }
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, getUserFromRequest } from "../_shared/supabase.ts";
import webpush from "https://esm.sh/web-push@3.6.7";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@nobeldrop.no",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

async function sendExpoBatch(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (!tokens.length) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      tokens.map((to) => ({ to, title, body, data, sound: "default", priority: "high" })),
    ),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const user = await getUserFromRequest(req);
    if (!user) return errorResponse("unauthorized", 401);

    const supabase = getServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") return errorResponse("forbidden", 403);

    const { drop_id, title, body, action_url } = await req.json();
    if (!drop_id) return errorResponse("missing_drop_id");

    const { data: drop } = await supabase
      .from("drops")
      .select("name, hype_copy")
      .eq("id", drop_id)
      .single();
    if (!drop) return errorResponse("drop_not_found", 404);

    const t = title ?? `${drop.name} er live`;
    const b = body ?? drop.hype_copy ?? "Begrenset antall lansert. Sikre din boks.";
    const url = action_url ?? `/drop/${drop_id}`;

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*, profiles!inner(push_enabled)")
      .eq("profiles.push_enabled", true);

    const expoTokens: string[] = [];
    let webSent = 0;

    for (const sub of subs ?? []) {
      if (sub.platform === "web" && sub.endpoint) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh!, auth: sub.auth! } },
            JSON.stringify({ title: t, body: b, url, drop_id }),
          );
          webSent++;
        } catch (e) {
          console.error("web push failed", e);
        }
      } else if (sub.expo_token) {
        expoTokens.push(sub.expo_token);
      }
    }

    await sendExpoBatch(expoTokens, t, b, { drop_id, url });

    return jsonResponse({ ok: true, web: webSent, native: expoTokens.length });
  } catch (err) {
    console.error("send-drop-notification error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
