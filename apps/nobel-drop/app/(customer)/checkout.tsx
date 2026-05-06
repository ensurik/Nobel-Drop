import { ScrollView, View, Text, Pressable, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { api } from "../../lib/api";
import { useCart } from "../../lib/cart";
import { Button } from "../../components/ui/Button";
import { Card, CardBody } from "../../components/ui/Card";
import { formatNok, formatTime, formatDate } from "../../lib/format";

export default function Checkout() {
  const cart = useCart();
  const [pickupSlotId, setPickupSlotId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"vipps" | "stripe" | "klarna">("vipps");
  const [useCredit, setUseCredit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: windows } = useQuery({
    queryKey: ["pickup", cart.drop_id],
    queryFn: () => api.pickup.forDrop(cart.drop_id!),
    enabled: !!cart.drop_id,
  });

  const { data: creditBalance } = useQuery({
    queryKey: ["credits", "balance"],
    queryFn: api.credits.balance,
    initialData: 0,
  });

  const totalQty = cart.totalQty;
  const subtotal = cart.totalOre;
  const creditApply = useCredit ? Math.min(creditBalance ?? 0, subtotal) : 0;
  const total = subtotal - creditApply;
  const minMet = subtotal >= 39600; // 396 kr

  const submit = async () => {
    if (!cart.drop_id || !pickupSlotId) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await api.orders.create({
        drop_id: cart.drop_id,
        pickup_slot_id: pickupSlotId,
        items: cart.lines.map((l) => ({ drop_item_id: l.drop_item_id, quantity: l.quantity })),
        credit_to_apply_ore: creditApply,
        payment_provider: provider,
        return_url: `${process.env.EXPO_PUBLIC_APP_URL}/orders/${"PLACEHOLDER"}`,
      });

      cart.clear();

      if (res.paid_with_credit) {
        router.replace(`/orders/${res.order_id}`);
        return;
      }

      // Vipps redirect
      if (provider === "vipps" && res.payment.redirect_url) {
        await WebBrowser.openBrowserAsync(res.payment.redirect_url);
        router.replace(`/orders/${res.order_id}`);
        return;
      }

      // Stripe / Klarna håndteres med native SDK i en ekte app.
      // For web-MVP: vis ordre, og la webhook fullføre i bakgrunnen.
      router.replace(`/orders/${res.order_id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Kunne ikke fullføre");
    } finally {
      setSubmitting(false);
    }
  };

  if (!cart.drop_id || cart.lines.length === 0) {
    return (
      <View className="flex-1 bg-ink-900 items-center justify-center p-8">
        <Stack.Screen options={{ title: "Kurv" }} />
        <Text className="text-bone-400 text-center mb-6">Kurven er tom.</Text>
        <Button onPress={() => router.back()}>Tilbake</Button>
      </View>
    );
  }

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Stack.Screen options={{ title: "Sjekkout" }} />

      <Card className="mb-4">
        <CardBody className="gap-2">
          <Text className="text-bone-400 uppercase tracking-widest text-xs mb-1">Din kurv</Text>
          {cart.lines.map((l) => (
            <View key={l.drop_item_id} className="flex-row justify-between">
              <Text className="text-bone-100 flex-1">
                {l.quantity}× {l.name}
              </Text>
              <Text className="text-bone-100 tabular-nums">
                {formatNok(l.unit_price_ore * l.quantity)}
              </Text>
            </View>
          ))}
          <View className="h-px bg-ink-600 my-2" />
          <View className="flex-row justify-between">
            <Text className="text-bone-400">Sum</Text>
            <Text className="text-bone-100 tabular-nums">{formatNok(subtotal)}</Text>
          </View>
          {!minMet && (
            <Text className="text-danger text-sm">Minimum 396 kr for å gå videre.</Text>
          )}
        </CardBody>
      </Card>

      {(creditBalance ?? 0) > 0 && (
        <Card className="mb-4">
          <CardBody>
            <Pressable
              onPress={() => setUseCredit((x) => !x)}
              className="flex-row items-center justify-between"
            >
              <View>
                <Text className="text-bone-100 font-sans-medium">Bruk Nobel-kreditt</Text>
                <Text className="text-bone-400 text-xs">
                  Saldo: {formatNok(creditBalance ?? 0)}
                </Text>
              </View>
              <View
                className={`w-12 h-6 rounded-full ${useCredit ? "bg-gold" : "bg-ink-600"} justify-center px-1`}
              >
                <View
                  className={`w-4 h-4 rounded-full bg-bone-100 ${useCredit ? "self-end" : ""}`}
                />
              </View>
            </Pressable>
          </CardBody>
        </Card>
      )}

      <Text className="text-bone-400 uppercase tracking-widest text-xs mb-2 mt-2">Hentested og tid</Text>
      <View className="gap-3 mb-4">
        {windows?.map((w) => (
          <Card key={w.id}>
            <CardBody>
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1">
                  <Text className="text-bone-100 font-sans-medium">
                    {(w as any).pickup_nodes?.name}
                  </Text>
                  <Text className="text-bone-400 text-xs mt-0.5">
                    {(w as any).pickup_nodes?.address}
                  </Text>
                  <Text className="text-bone-400 text-xs mt-1">
                    {formatDate(w.starts_at)} · {formatTime(w.starts_at)}–{formatTime(w.ends_at)}
                  </Text>
                </View>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {(w as any).pickup_slots?.map((s: any) => {
                  const full = s.reserved_count >= s.max_customers;
                  const selected = pickupSlotId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => !full && setPickupSlotId(s.id)}
                      disabled={full}
                      className={`px-3 py-2 rounded border ${
                        selected
                          ? "bg-gold border-gold-bright"
                          : full
                          ? "bg-ink-700 border-ink-600 opacity-40"
                          : "bg-ink-800 border-ink-600"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          selected ? "text-ink-900 font-sans-bold" : "text-bone-100"
                        }`}
                      >
                        {formatTime(s.starts_at)}–{formatTime(s.ends_at)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </CardBody>
          </Card>
        ))}
      </View>

      <Text className="text-bone-400 uppercase tracking-widest text-xs mb-2 mt-2">Betaling</Text>
      <View className="flex-row gap-2 mb-4">
        {(["vipps", "stripe", "klarna"] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setProvider(p)}
            className={`flex-1 py-3 rounded border items-center ${
              provider === p ? "bg-gold border-gold-bright" : "bg-ink-800 border-ink-600"
            }`}
          >
            <Text
              className={`uppercase tracking-widest text-xs font-sans-bold ${
                provider === p ? "text-ink-900" : "text-bone-100"
              }`}
            >
              {p === "stripe" ? "Apple Pay" : p}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card className="mb-6">
        <CardBody>
          <View className="flex-row justify-between mb-2">
            <Text className="text-bone-400">Sum</Text>
            <Text className="text-bone-100 tabular-nums">{formatNok(subtotal)}</Text>
          </View>
          {creditApply > 0 && (
            <View className="flex-row justify-between mb-2">
              <Text className="text-bone-400">Nobel-kreditt</Text>
              <Text className="text-success tabular-nums">−{formatNok(creditApply)}</Text>
            </View>
          )}
          <View className="h-px bg-ink-600 my-2" />
          <View className="flex-row justify-between">
            <Text className="text-bone-100 font-sans-bold">Å betale</Text>
            <Text className="text-gold-bright font-display text-2xl tabular-nums">
              {formatNok(total)}
            </Text>
          </View>
        </CardBody>
      </Card>

      {err ? <Text className="text-danger mb-3">{err}</Text> : null}

      <Button
        onPress={submit}
        disabled={!pickupSlotId || !minMet || submitting}
        loading={submitting}
        fullWidth
        size="lg"
      >
        Bekreft og betal
      </Button>
    </ScrollView>
  );
}
