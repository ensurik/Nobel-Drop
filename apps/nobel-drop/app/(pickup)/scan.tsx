import { useEffect, useState, useRef } from "react";
import { View, Text, Platform, Pressable } from "react-native";
import { Stack } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; message: string; order?: any } | null>(null);
  const lastScanRef = useRef<string | null>(null);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission?.granted, requestPermission]);

  const handleBarcode = async ({ data }: { data: string }) => {
    if (!scanning) return;
    if (lastScanRef.current === data) return;
    lastScanRef.current = data;
    setScanning(false);

    try {
      const verifyResult = await api.pickupVerify(data);
      const order = (verifyResult as { order?: { id: string; customer?: string; items?: Array<{ name?: string; qty: number }> } })?.order;
      setResult({
        ok: true,
        message: order?.customer ? `Hentet av ${order.customer}` : "Hentet",
        order,
      });
    } catch (err: unknown) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Feilet" });
    }

    setTimeout(() => {
      setResult(null);
      lastScanRef.current = null;
      setScanning(true);
    }, 4000);
  };

  return (
    <View className="flex-1 bg-ink-900">
      <Stack.Screen options={{ title: "Skann" }} />

      {!permission?.granted && Platform.OS !== "web" && (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-bone-100 text-center mb-4">Vi trenger kameratilgang for å skanne.</Text>
          <Button onPress={requestPermission}>Gi tilgang</Button>
        </View>
      )}

      {permission?.granted && (
        <View className="flex-1">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={scanning ? handleBarcode : undefined}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
          <View className="absolute inset-0 items-center justify-center pointer-events-none">
            <View className="w-64 h-64 border-2 border-gold-bright rounded-2xl" />
          </View>
        </View>
      )}

      {Platform.OS === "web" && !permission?.granted && (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-bone-100 text-center mb-4">
            Web-kamera fungerer best på mobil. Trykk gi tilgang nedenfor.
          </Text>
          <Button onPress={requestPermission}>Gi tilgang</Button>
        </View>
      )}

      {result && (
        <View
          className={`absolute bottom-8 left-4 right-4 p-4 rounded-lg border ${
            result.ok ? "bg-success/20 border-success" : "bg-danger/20 border-danger"
          }`}
        >
          <Text className={`font-display text-lg ${result.ok ? "text-success" : "text-danger"}`}>
            {result.ok ? "OK" : "Feil"}
          </Text>
          <Text className="text-bone-100 mt-1">{result.message}</Text>
          {result.order?.items && (
            <View className="mt-2">
              {result.order.items.map((it: { name?: string; qty: number }, idx: number) => (
                <Text key={idx} className="text-bone-400 text-sm">
                  {it.qty}× {it.name}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
