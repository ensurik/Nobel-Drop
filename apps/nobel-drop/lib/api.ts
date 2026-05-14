import { supabase } from "./supabase";
import type {
  Drop, DropItem, Order, PickupWindow, PaymentProvider,
} from "@nobel/types";

export interface DropStats {
  drop_id: string;
  status: string;
  total_units: number;
  units_sold: number;
  units_left: number;
  sold_last_5min: number;
  sold_last_15min: number;
  sold_total: number;
  velocity_label: "cold" | "warm" | "hot" | "sold_out";
  first_paid_at: string | null;
  minutes_since_first_sale: number | null;
  estimated_sold_out_at: string | null;
  computed_at: string;
}

export const api = {
  drops: {
    listLive: async () => {
      const { data, error } = await supabase
        .from("drops")
        .select("*")
        .in("status", ["live", "scheduled", "sold_out"])
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data as Drop[];
    },

    byId: async (id: string) => {
      const { data, error } = await supabase
        .from("drops")
        .select("*, drop_items(*, products(*))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Drop & { drop_items: DropItem[] };
    },

    stats: async (id: string) => {
      const { data, error } = await supabase.rpc("get_drop_stats", { p_drop_id: id });
      if (error) throw error;
      return data as DropStats;
    },
  },

  pickup: {
    forDrop: async (dropId: string) => {
      const { data, error } = await supabase
        .from("pickup_windows")
        .select("*, pickup_nodes(*), pickup_slots(*)")
        .eq("drop_id", dropId)
        .eq("status", "open")
        .order("starts_at");
      if (error) throw error;
      return data as PickupWindow[];
    },
  },

  orders: {
    create: async (payload: {
      drop_id: string;
      pickup_slot_id: string;
      items: Array<{ drop_item_id: string; quantity: number }>;
      credit_to_apply_ore?: number;
      payment_provider: PaymentProvider;
      return_url?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("create-order", { body: payload });
      if (error) throw error;
      return data as {
        order_id: string;
        total_ore: number;
        currency: string;
        payment: { redirect_url?: string; client_secret?: string; client_token?: string };
        paid_with_credit?: boolean;
      };
    },

    mine: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, products(*))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },

    byId: async (id: string) => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, products(*)), pickup_windows(*, pickup_nodes(*))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Order;
    },
  },

  credits: {
    balance: async () => {
      const { data } = await supabase
        .from("user_credit_balances")
        .select("balance_ore")
        .single();
      return (data?.balance_ore as number | undefined) ?? 0;
    },
    history: async () => {
      const { data, error } = await supabase
        .from("credits_ledger")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  },

  pickupVerify: async (token: string) => {
    const { data, error } = await supabase.functions.invoke("verify-pickup", { body: { token } });
    if (error) throw error;
    return data;
  },
};
