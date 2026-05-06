// Domain-typer som deles mellom frontend og edge functions.
// Generer DB-typer fra Supabase med: npm run types:db (skriver til db.ts).

export type DropStatus = "draft" | "scheduled" | "live" | "sold_out" | "closed";
export type ProductCategory = "hero" | "addon" | "main_cake" | "dinner" | "seasonal";
export type DropItemRole = "hero" | "addon" | "order_lifter";
export type OrderStatus =
  | "pending" | "reserved" | "paid" | "confirmed" | "picked_up" | "refunded" | "cancelled";
export type PaymentProvider = "vipps" | "stripe" | "klarna";
export type PickupWindowStatus = "open" | "locked" | "confirmed" | "cancelled_refund";

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  base_price_ore: number;
  image_url: string | null;
  hero_image_url: string | null;
  is_active: boolean;
}

export interface Drop {
  id: string;
  slug: string;
  name: string;
  status: DropStatus;
  starts_at: string;
  ends_at: string;
  total_units: number;
  units_sold: number;
  cover_image_url: string | null;
  hype_copy: string | null;
}

export interface DropItem {
  id: string;
  drop_id: string;
  product_id: string;
  role: DropItemRole;
  price_ore: number;
  available_units: number;
  sold_units: number;
  display_order: number;
  products?: Product;
}

export interface PickupNode {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  type: "own_stop" | "partner";
  is_active: boolean;
}

export interface PickupSlot {
  id: string;
  window_id: string;
  starts_at: string;
  ends_at: string;
  max_customers: number;
  reserved_count: number;
}

export interface PickupWindow {
  id: string;
  drop_id: string;
  node_id: string;
  starts_at: string;
  ends_at: string;
  min_volume_required: number;
  reserved_count: number;
  status: PickupWindowStatus;
  cutoff_at: string;
  pickup_nodes?: PickupNode;
  pickup_slots?: PickupSlot[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  drop_item_id: string | null;
  quantity: number;
  unit_price_ore: number;
  line_total_ore: number;
  products?: Product;
}

export interface Order {
  id: string;
  user_id: string;
  drop_id: string | null;
  pickup_window_id: string | null;
  pickup_slot_id: string | null;
  status: OrderStatus;
  subtotal_ore: number;
  credit_applied_ore: number;
  total_ore: number;
  currency: string;
  payment_provider: PaymentProvider | null;
  pickup_qr_token: string | null;
  picked_up_at: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  refund_reason: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

export interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  role: "customer" | "admin" | "driver";
  marketing_consent: boolean;
  push_enabled: boolean;
}

// Hjelpefunksjoner
export const oreToKr = (ore: number) => (ore / 100).toFixed(2);
export const formatNok = (ore: number) =>
  new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(ore / 100);
