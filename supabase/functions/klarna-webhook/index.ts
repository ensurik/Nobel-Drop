// =====================================================================
// klarna-webhook
// Klarna har ikke automatisk callback i samme grad som Vipps/Stripe.
// I praksis kalles denne fra frontend etter authorize, eller via
// Klarna Push Notification (om aktivert).
// Body: { authorization_token, order_id (vår), session_id }
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { signPickupToken } from "../_shared/qr.ts";

const KLARNA_BASE_URL = Deno.env.get("KLARNA_BASE_URL") ?? "https://api.playground.klarna.com";

function basicAuth() {
  const u = Deno.env.get("KLARNA_USERNAME")!;
  const p = Deno.env.get("KLARNA_PASSWORD")!;
  return `Basic ${btoa(`${u}:${p}`)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const { authorization_token, order_id, session_id } = await req.json();
    if (!authorization_token || !order_id) return errorResponse("missing_fields");

    const supabase = getServiceClient();
    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(*, products(name))")
      .eq("id", order_id)
      .single();
    if (!order) return errorResponse("order_not_found", 404);

    const items = (order as { order_items: Array<{ products: { name: string }, quantity: number, unit_price_ore: number, line_total_ore: number }> }).order_items.map((oi) => ({
      type: "physical",
      name: oi.products?.name ?? "Produkt",
      quantity: oi.quantity,
      unit_price: oi.unit_price_ore,
      tax_rate: 1500,
      total_amount: oi.line_total_ore,
      total_tax_amount: Math.round((oi.line_total_ore * 15) / 115),
    }));

    const placePayload = {
      purchase_country: "NO",
      purchase_currency: "NOK",
      locale: "nb-NO",
      order_amount: order.total_ore,
      order_tax_amount: Math.round((order.total_ore * 15) / 115),
      order_lines: items,
      merchant_reference1: order_id,
    };

    const res = await fetch(
      `${KLARNA_BASE_URL}/payments/v1/authorizations/${authorization_token}/order`,
      {
        method: "POST",
        headers: { Authorization: basicAuth(), "Content-Type": "application/json" },
        body: JSON.stringify(placePayload),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      console.error("klarna place error", data);
      return errorResponse("klarna_place_failed", 502, { detail: data });
    }

    await supabase
      .from("payment_intents")
      .update({
        status: "captured",
        provider_intent_id: data.order_id ?? session_id,
        raw_payload: data,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "klarna")
      .eq("order_id", order_id);

    const token = await signPickupToken(order_id, Deno.env.get("PICKUP_QR_SECRET")!);
    await supabase.rpc("confirm_order_paid", {
      p_order_id: order_id,
      p_provider: "klarna",
      p_provider_intent_id: data.order_id ?? session_id,
      p_pickup_qr_token: token,
    });

    return jsonResponse({ ok: true, klarna_order_id: data.order_id });
  } catch (err) {
    console.error("klarna-webhook error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
