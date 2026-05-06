// =====================================================================
// create-order
// Atomisk reservasjon av drop-units og pickup-slot, deretter oppretting
// av payment intent hos valgt provider. Returnerer redirect/client_secret.
//
// POST body:
// {
//   drop_id: uuid,
//   pickup_slot_id: uuid,
//   items: [{ drop_item_id: uuid, quantity: int }],
//   credit_to_apply_ore?: bigint,
//   payment_provider: 'vipps' | 'stripe' | 'klarna',
//   return_url?: string                    // for Vipps/Klarna
// }
// =====================================================================
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, getUserFromRequest } from "../_shared/supabase.ts";

interface OrderPayload {
  drop_id: string;
  pickup_slot_id: string;
  items: Array<{ drop_item_id: string; quantity: number }>;
  credit_to_apply_ore?: number;
  payment_provider: "vipps" | "stripe" | "klarna";
  return_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const user = await getUserFromRequest(req);
    if (!user) return errorResponse("unauthorized", 401);

    const payload = (await req.json()) as OrderPayload;
    if (!payload.drop_id || !payload.pickup_slot_id || !payload.items?.length) {
      return errorResponse("missing_fields");
    }
    if (!["vipps", "stripe", "klarna"].includes(payload.payment_provider)) {
      return errorResponse("invalid_provider");
    }

    const supabase = getServiceClient();

    // 1. Atomisk reservasjon
    const { data: reservedId, error: reserveError } = await supabase.rpc("reserve_order", {
      p_user_id: user.id,
      p_drop_id: payload.drop_id,
      p_pickup_slot_id: payload.pickup_slot_id,
      p_items: payload.items,
      p_credit_to_apply_ore: payload.credit_to_apply_ore ?? 0,
    });

    if (reserveError) {
      console.error("reserve_order failed", reserveError);
      return errorResponse(reserveError.message || "reservation_failed", 422);
    }

    const orderId = reservedId as string;

    // 2. Hent oppdatert ordre
    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(*, products(name))")
      .eq("id", orderId)
      .single();

    if (!order) return errorResponse("order_not_found_after_reserve", 500);

    if (order.total_ore === 0) {
      // 100 % betalt med kreditt — ingen ekstern betaling nødvendig.
      const { signPickupToken } = await import("../_shared/qr.ts");
      const token = await signPickupToken(orderId, Deno.env.get("PICKUP_QR_SECRET")!);
      await supabase.rpc("confirm_order_paid", {
        p_order_id: orderId,
        p_provider: "credit",
        p_provider_intent_id: null,
        p_pickup_qr_token: token,
      });
      return jsonResponse({ order_id: orderId, paid_with_credit: true });
    }

    // 3. Initier betaling hos valgt provider
    let paymentResult: Record<string, unknown> = {};
    const providerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${payload.payment_provider === "vipps" ? "vipps-create-payment" :
      payload.payment_provider === "stripe" ? "stripe-create-intent" : "klarna-create-session"}`;

    const providerRes = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("Authorization") ?? "",
      },
      body: JSON.stringify({
        order_id: orderId,
        amount_ore: order.total_ore,
        return_url: payload.return_url,
      }),
    });

    if (!providerRes.ok) {
      const text = await providerRes.text();
      console.error("provider_init_failed", text);
      // Trigger refund av units (cancel reservation)
      await supabase
        .from("orders")
        .update({ status: "cancelled", refund_reason: "provider_init_failed" })
        .eq("id", orderId);
      return errorResponse("provider_init_failed", 502, { detail: text });
    }

    paymentResult = await providerRes.json();

    return jsonResponse({
      order_id: orderId,
      total_ore: order.total_ore,
      currency: order.currency,
      payment: paymentResult,
    });
  } catch (err) {
    console.error("create-order error", err);
    return errorResponse(err instanceof Error ? err.message : "unknown", 500);
  }
});
