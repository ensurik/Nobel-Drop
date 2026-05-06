// =====================================================================
// klarna-create-session
// Lager Klarna Payments session. Frontend bruker client_token i Klarna SDK.
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

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
    const { order_id, amount_ore } = await req.json();
    if (!order_id || !amount_ore) return errorResponse("missing_fields");

    const supabase = getServiceClient();
    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(*, products(name))")
      .eq("id", order_id)
      .single();
    if (!order) return errorResponse("order_not_found", 404);

    const orderLines = (order as { order_items: Array<{ products: { name: string }, quantity: number, unit_price_ore: number, line_total_ore: number }> }).order_items.map((oi) => ({
      type: "physical",
      name: oi.products?.name ?? "Produkt",
      quantity: oi.quantity,
      unit_price: oi.unit_price_ore,
      tax_rate: 1500, // 15 % MVA på mat — sjekk korrekt sats per kategori
      total_amount: oi.line_total_ore,
      total_tax_amount: Math.round((oi.line_total_ore * 15) / 115),
    }));

    const sessionPayload = {
      purchase_country: "NO",
      purchase_currency: "NOK",
      locale: "nb-NO",
      order_amount: amount_ore,
      order_tax_amount: Math.round((amount_ore * 15) / 115),
      order_lines: orderLines,
      merchant_reference1: order_id,
    };

    const res = await fetch(`${KLARNA_BASE_URL}/payments/v1/sessions`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionPayload),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("klarna session error", data);
      return errorResponse("klarna_session_failed", 502, { detail: data });
    }

    await supabase.from("payment_intents").insert({
      order_id,
      provider: "klarna",
      provider_intent_id: data.session_id,
      status: "session_created",
      amount_ore,
      raw_payload: data,
    });

    return jsonResponse({
      provider: "klarna",
      session_id: data.session_id,
      client_token: data.client_token,
      payment_method_categories: data.payment_method_categories,
    });
  } catch (err) {
    console.error("klarna-create-session error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
