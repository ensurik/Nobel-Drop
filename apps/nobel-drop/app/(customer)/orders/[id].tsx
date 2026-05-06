import { ScrollView, View, Text, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";
import { useEffect } from "react";
import { api } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { Card, CardBody } from "../../../components/ui/Card";
import { formatNok, formatTime, formatDate } from "../../../lib/format";

const STATUS_LABEL: Record<string, string> = {
  reserved: "Reservert (avventer betaling)",
  paid: "Betalt — venter på henting",
  confirmed: "Bekreftet — klar for henting",
  picked_up: "Hentet",
  refunded: "Refundert",
  cancelled: "Avbrutt",
};

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, refetch, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.orders.byId(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const data = q.state.data;
      return data && (data.status === "paid" || data.status === "confirmed") ? false : 5000;
    },
  });

  // Realtime: oppdatering på status
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`order_${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetch]);

  if (isLoading || !order) {
    return (
      <View className="flex-1 bg-ink-900 items-center justify-center">
        <ActivityIndicator color="#C8A24C" />
      </View>
    );
  }

  const window = (order as any).pickup_windows;
  const node = window?.pickup_nodes;
  const showQr = !!order.pickup_qr_token && ["paid", "confirmed"].includes(order.status);

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: `Ordre ${order.id.substring(0, 6)}` }} />

      <View className="items-center mb-6">
        <Text className="text-bone-400 uppercase tracking-widest text-xs mb-1">Status</Text>
        <Text className="font-display text-2xl text-gold-bright">
          {STATUS_LABEL[order.status] ?? order.status}
        </Text>
      </View>

      {showQr && (
        <Card className="mb-4">
          <CardBody className="items-center">
            <Text className="text-bone-400 uppercase tracking-widest text-xs mb-3">
              Vis ved henting
            </Text>
            <View className="bg-bone-100 p-4 rounded-lg">
              <QRCode value={order.pickup_qr_token!} size={220} />
            </View>
            <Text className="text-bone-400 text-xs mt-3 text-center">
              Skannes av sjåfør på pickup-stoppet.
            </Text>
          </CardBody>
        </Card>
      )}

      {window && node && (
        <Card className="mb-4">
          <CardBody>
            <Text className="text-bone-400 uppercase tracking-widest text-xs mb-2">Henting</Text>
            <Text className="text-bone-100 font-sans-medium">{node.name}</Text>
            {node.address && <Text className="text-bone-400 text-sm">{node.address}</Text>}
            <Text className="text-bone-100 mt-2">
              {formatDate(window.starts_at)} · {formatTime(window.starts_at)}–{formatTime(window.ends_at)}
            </Text>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <Text className="text-bone-400 uppercase tracking-widest text-xs mb-3">Innhold</Text>
          {order.order_items?.map((oi) => (
            <View key={oi.id} className="flex-row justify-between mb-2">
              <Text className="text-bone-100 flex-1">
                {oi.quantity}× {oi.products?.name}
              </Text>
              <Text className="text-bone-100 tabular-nums">{formatNok(oi.line_total_ore)}</Text>
            </View>
          ))}
          <View className="h-px bg-ink-600 my-2" />
          <View className="flex-row justify-between">
            <Text className="text-bone-400">Sum</Text>
            <Text className="text-bone-100 tabular-nums">{formatNok(order.subtotal_ore)}</Text>
          </View>
          {order.credit_applied_ore > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-bone-400">Kreditt</Text>
              <Text className="text-success tabular-nums">
                −{formatNok(order.credit_applied_ore)}
              </Text>
            </View>
          )}
          <View className="flex-row justify-between mt-2">
            <Text className="text-bone-100 font-sans-bold">Betalt</Text>
            <Text className="text-gold-bright font-display text-xl tabular-nums">
              {formatNok(order.total_ore)}
            </Text>
          </View>
        </CardBody>
      </Card>
    </ScrollView>
  );
}
