import { ScrollView, View, Text, Pressable, Image, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { api } from "../../lib/api";
import { Countdown } from "../../components/Countdown";
import { ScarcityBar } from "../../components/ScarcityBar";

export default function Home() {
  const { data: drops, refetch, isRefetching } = useQuery({
    queryKey: ["drops", "live"],
    queryFn: api.drops.listLive,
  });

  return (
    <ScrollView
      className="bg-ink-900"
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor="#C8A24C" />}
    >
      <View className="px-5 pt-6 pb-4">
        <Text className="text-bone-400 uppercase tracking-widest text-xs">I dag</Text>
        <Text className="font-display text-3xl text-bone-100 mt-1">Dagens drops</Text>
      </View>

      {drops?.length === 0 ? (
        <View className="px-5 py-16 items-center">
          <Text className="text-bone-400 text-center">
            Ingen drops akkurat nå. Slå på varsler under "Konto" for å bli først.
          </Text>
        </View>
      ) : null}

      {drops?.map((drop) => {
        const live = drop.status === "live";
        const remaining = drop.total_units - drop.units_sold;
        return (
          <Link key={drop.id} href={`/drop/${drop.id}`} asChild>
            <Pressable className="mx-5 mb-5">
              <View className="rounded-xl overflow-hidden border border-gold-deep bg-ink-800">
                {drop.cover_image_url ? (
                  <Image
                    source={{ uri: drop.cover_image_url }}
                    style={{ width: "100%", height: 220 }}
                  />
                ) : (
                  <View className="w-full h-[220px] bg-ink-700" />
                )}
                <View className="p-4">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <Text className="font-display text-2xl text-bone-100">{drop.name}</Text>
                      {drop.hype_copy ? (
                        <Text className="text-bone-400 mt-1">{drop.hype_copy}</Text>
                      ) : null}
                    </View>
                    {live ? (
                      <View className="bg-gold-deep border border-gold rounded-full px-3 py-1">
                        <Text className="text-gold-bright text-xs uppercase tracking-widest">Live</Text>
                      </View>
                    ) : drop.status === "sold_out" ? (
                      <View className="bg-danger/20 border border-danger rounded-full px-3 py-1">
                        <Text className="text-danger text-xs uppercase tracking-widest">Utsolgt</Text>
                      </View>
                    ) : null}
                  </View>

                  <View className="mt-4">
                    <ScarcityBar remaining={remaining} total={drop.total_units} />
                  </View>

                  {live ? (
                    <View className="mt-4 flex-row items-center justify-between">
                      <Text className="text-bone-400 text-xs">Stenger om</Text>
                      <Countdown to={drop.ends_at} />
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          </Link>
        );
      })}
    </ScrollView>
  );
}
