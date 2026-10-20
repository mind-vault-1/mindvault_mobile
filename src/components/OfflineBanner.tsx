import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme";

interface OfflineBannerProps {
  isOffline: boolean;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      backgroundColor: colors.danger,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: "center",
    },
    text: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "600",
    },
  });
}

export function OfflineBanner({ isOffline }: OfflineBannerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!isOffline) return null;

  return (
    <View
      style={styles.banner}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="No internet connection"
    >
      <Text style={styles.text}>No Internet Connection</Text>
    </View>
  );
}
