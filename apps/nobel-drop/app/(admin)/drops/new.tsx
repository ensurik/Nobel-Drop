// MVP-stub. Bygges ut i Cursor — se CURSOR.md prompt #4.
// Inntil videre: opprett drops i Supabase Studio eller via SQL seed.
import { ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Card, CardBody } from "../../../components/ui/Card";

export default function NewDrop() {
  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: "Nytt drop" }} />
      <Card>
        <CardBody>
          <Text className="text-bone-100 font-sans-medium mb-2">Drop-wizard kommer</Text>
          <Text className="text-bone-400 text-sm">
            Foreløpig opprettes drops via Supabase SQL eller Studio. Se CURSOR.md prompt #4 for å bygge wizard.
          </Text>
        </CardBody>
      </Card>
    </ScrollView>
  );
}
