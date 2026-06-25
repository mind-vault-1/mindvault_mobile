import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useAppTheme } from "../theme/ThemeProvider";
import type { ThemeColors } from "../theme";

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    bone: {
      backgroundColor: colors.border,
    },
    badges: {
      flexDirection: "row",
      gap: 6,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
    },
  });
}

function Bone({
  width,
  height = 14,
  style,
}: {
  width: number | `${number}%`;
  height?: number;
  style: ReturnType<typeof createStyles>["bone"];
}) {
  return <View style={[style, { width, height, borderRadius: height / 2 }]} />;
}

export function SkeletonCard() {
  const { colors, shared } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[shared.card, { opacity }]}>
      <Bone width="60%" height={16} style={styles.bone} />
      <Bone width="40%" style={styles.bone} />
      <Bone width="50%" height={12} style={styles.bone} />
      <View style={styles.badges}>
        <Bone width={70} height={22} style={styles.bone} />
        <Bone width={80} height={22} style={styles.bone} />
      </View>
      <View style={styles.footer}>
        <Bone width={80} height={15} style={styles.bone} />
        <Bone width={72} height={36} style={styles.bone} />
      </View>
      <Bone width="100%" height={36} style={styles.bone} />
    </Animated.View>
  );
}
