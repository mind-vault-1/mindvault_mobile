import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors, shared } from "../theme";

function Bone({ width, height = 14 }: { width: number | `${number}%`; height?: number }) {
  return <View style={[styles.bone, { width, height, borderRadius: height / 2 }]} />;
}

export function SkeletonCard() {
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
      {/* title */}
      <Bone width="60%" height={16} />
      {/* publisher */}
      <Bone width="40%" />
      {/* owner caption */}
      <Bone width="50%" height={12} />
      {/* badges */}
      <View style={styles.badges}>
        <Bone width={70} height={22} />
        <Bone width={80} height={22} />
      </View>
      {/* footer: price + button */}
      <View style={styles.footer}>
        <Bone width={80} height={15} />
        <Bone width={72} height={36} />
      </View>
      {/* edit button */}
      <Bone width="100%" height={36} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
