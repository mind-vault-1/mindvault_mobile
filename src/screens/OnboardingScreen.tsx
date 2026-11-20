import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../navigation";
import { useAppTheme } from "../theme/ThemeProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../services/storage";

const ONBOARDING_KEY = `${STORAGE_KEYS.catalogFilters}:onboarding`;

interface Slide {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const slides: Slide[] = [
  {
    id: "1",
    title: "Welcome to MindVault",
    description:
      "Payment-protected digital resources on Stellar. Access knowledge with confidence.",
    icon: "🏦",
  },
  {
    id: "2",
    title: "What is USDC?",
    description:
      "USDC is a stablecoin on Stellar. It's backed 1:1 by US dollars and helps you pay for resources securely.",
    icon: "💵",
  },
  {
    id: "3",
    title: "Testnet Only",
    description:
      "This app connects to Stellar's testnet for learning and testing. No real money is involved.",
    icon: "🧪",
  },
  {
    id: "4",
    title: "Start Browsing",
    description: "Tap 'Get Started' to explore the catalog of available resources.",
    icon: "🚀",
  },
];

export function OnboardingScreen() {
  const { colors, shared } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const markOnboardingSeen = async () => {
      try {
        await AsyncStorage.setItem(ONBOARDING_KEY, "true");
      } catch {
      }
    };
    void markOnboardingSeen();
  }, []);

  const handleNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentSlide + 1,
        animated: true,
      });
    } else {
      navigation.navigate("Catalog");
    }
  }, [currentSlide, navigation]);

  const handleSkip = useCallback(() => {
    navigation.navigate("Catalog");
  }, [navigation]);

  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / Dimensions.get("window").width);
    setCurrentSlide(index);
  };

  const renderSlide = ({ item }: { item: Slide }) => {
    return (
      <View style={[styles.slide, { backgroundColor: colors.surface }]}>
        <View style={styles.slideContent}>
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            {item.description}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[shared.screen, { backgroundColor: colors.surface }]} edges={["top", "bottom"]}>
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        scrollEventThrottle={16}
        onScroll={handleScroll}
        scrollIndicatorInsets={{ right: 1 }}
        accessibilityRole="list"
        accessibilityLabel="Onboarding slides"
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === currentSlide ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="progressbar"
              accessibilityLabel={`Slide ${index + 1} of ${slides.length}`}
              accessibilityState={{
                selected: index === currentSlide,
              }}
            />
          ))}
        </View>

        <View style={styles.buttons}>
          <Pressable
            onPress={handleSkip}
            style={[styles.button, { borderColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={[styles.buttonText, { color: colors.primary }]}>Skip</Text>
          </Pressable>

          <Pressable
            onPress={handleNext}
            style={[styles.button, shared.primaryButton]}
            accessibilityRole="button"
            accessibilityLabel={
              currentSlide === slides.length - 1 ? "Get started" : "Next slide"
            }
          >
            <Text style={[styles.buttonText, shared.primaryButtonText]}>
              {currentSlide === slides.length - 1 ? "Get Started" : "Next"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  slide: {
    width: Dimensions.get("window").width,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  slideContent: {
    alignItems: "center",
    gap: 24,
  },
  icon: {
    fontSize: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300,
  },
  footer: {
    padding: 24,
    gap: 24,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
