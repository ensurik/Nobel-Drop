import { ScrollView, View, Text, Image, Pressable } from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../../../lib/api";
import { useCart } from "../../../lib/cart";
import { supabase } from "../../../lib/supabase";
import { Button } from "../../../components/ui/Button";
import { Countdown } from "../../../components/Countdown";
import { ScarcityBar } from "../../../components/ScarcityBar";
import { formatNok } from "../../../lib/format";

export default function DropDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cart = useCart();
  const queryClient = useQueryClient();
  const { data: drop } = useQuery({
    queryKey: ["drop", id],
    queryFn: () => api.drops.byId(id!),
    enabled: !!id,
  });

  // Live-stats (velocity, sold_last_5min) — pollet hvert 30. sek for å fange
  // velocity-endringer som ikke triggeres av drop_items-update alene.
  const { data: stats } = useQuery({
    queryKey: ["drop-stats", id],
    queryFn: () => api.drops.stats(id!),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  // Realtime: subscribe på drop_items endringer for live "kun X igjen"
  useEffect(() => {
    if (!id) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["drop", id] });
      queryClient.invalidateQueries({ queryKey: ["drop-stats", id] });
    };
    const channel = supabase
      .channel(`drop_${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drop_items", filter: `drop_id=eq.${id}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drops", filter: `id=eq.${id}` },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  if (!drop) return null;

  const heroes = drop.drop_items.filter((di) => di.role === "hero");
  const addons = drop.drop_items.filter((di) => di.role === "addon");
  const lifters = drop.drop_items.filter((di) => di.role === "order_lifter");

  return (
    <View className="flex-1 bg-ink-900">
      <Stack.Screen options={{ title: drop.name }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {drop.cover_image_url ? (
          <Image source={{ uri: drop.cover_image_url }} style={{ width: "100%", height: 280 }} />
        ) : null}

        <View className="px-5 py-6 gap-5">
          <View>
            <Text className="font-display text-3xl text-bone-100">{drop.name}</Text>
            {drop.hype_copy ? (
              <Text className="text-bone-400 mt-2">{drop.hype_copy}</Text>
            ) : null}
          </View>

          <View className="bg-ink-800 border border-gold-deep rounded-lg p-4 items-center">
            <Countdown to={drop.ends_at} variant="expanded" label="Stenger om" />
            <View className="w-full mt-4">
              <ScarcityBar
                remaining={stats?.units_left ?? drop.total_units - drop.units_sold}
                total={drop.total_units}
                velocityLabel={stats?.velocity_label}
                soldLast5min={stats?.sold_last_5min}
              />
            </View>
          </View>

          {heroes.length > 0 && (
            <Section title="Hero-produkt">
              {heroes.map((di) => (
                <DropItemRow key={di.id} di={di} dropId={drop.id} />
              ))}
            </Section>
          )}

          {lifters.length > 0 && (
            <Section title="Ordreløftere">
              {lifters.map((di) => (
                <DropItemRow key={di.id} di={di} dropId={drop.id} />
              ))}
            </Section>
          )}

          {addons.length > 0 && (
            <Section title="Add-ons">
              {addons.map((di) => (
                <DropItemRow key={di.id} di={di} dropId={drop.id} />
              ))}
            </Section>
          )}
        </View>
      </ScrollView>

      {cart.totalQty > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-ink-900 border-t border-ink-600 p-4">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-bone-100 font-sans-medium">
              {cart.totalQty} {cart.totalQty === 1 ? "vare" : "varer"} i kurv
            </Text>
            <Text className="text-gold-bright font-display text-xl">
              {formatNok(cart.totalOre)}
            </Text>
          </View>
          <Button onPress={() => router.push("/checkout")} fullWidth>
            Fortsett til pickup
          </Button>
        </View>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="text-bone-400 uppercase tracking-widest text-xs mb-3">{title}</Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

function DropItemRow({ di, dropId }: { di: any; dropId: string }) {
  const cart = useCart();
  const remaining = di.available_units - di.sold_units;
  const inCart = cart.lines.find((l) => l.drop_item_id === di.id);
  const soldOut = remaining <= 0;

  return (
    <View className="bg-ink-800 border border-ink-600 rounded-lg overflow-hidden flex-row">
      {di.products?.image_url ? (
        <Image source={{ uri: di.products.image_url }} style={{ width: 88, height: 88 }} />
      ) : (
        <View className="w-[88px] h-[88px] bg-ink-700" />
      )}
      <View className="flex-1 p-3 justify-between">
        <View>
          <Text className="text-bone-100 font-sans-medium">{di.products?.name}</Text>
          <Text className="text-bone-400 text-xs mt-0.5">
            {soldOut ? "Utsolgt" : `${remaining} igjen`}
          </Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-gold-bright font-display text-lg">{formatNok(di.price_ore)}</Text>
          {soldOut ? (
            <Text className="text-danger uppercase tracking-widest text-xs">Tomt</Text>
          ) : inCart ? (
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => cart.setQty(di.id, Math.max(0, inCart.quantity - 1))}
                className="w-8 h-8 bg-ink-700 rounded items-center justify-center"
              >
                <Text className="text-bone-100">−</Text>
              </Pressable>
              <Text className="text-bone-100 w-6 text-center">{inCart.quantity}</Text>
              <Pressable
                onPress={() => cart.setQty(di.id, inCart.quantity + 1)}
                className="w-8 h-8 bg-gold rounded items-center justify-center"
              >
                <Text className="text-ink-900 font-sans-bold">+</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => cart.add(dropId, di)}
              className="bg-gold px-4 py-2 rounded"
            >
              <Text className="text-ink-900 font-sans-bold uppercase text-xs tracking-widest">
                Velg
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
