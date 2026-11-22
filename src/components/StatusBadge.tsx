import { StyleSheet, Text, View } from "react-native";

import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { getResourceTypeLabel } from "../types";

export type StatusBadgeKind = "verification" | "onchain" | "type";

interface StatusBadgeProps {
  kind: StatusBadgeKind;
  /** A `VerificationStatus`, `OnchainStatus`, or resource type depending on `kind`. */
  status: string;
}

const ICONS: Record<string, string> = {
  verified: "✓",
  rejected: "✗",
  pending: "⏳",
  registered: "⛓",
  failed: "✗",
  none: "○",
  file: "📄",
  link: "🔗",
};

function badgeText(kind: StatusBadgeKind, status: string): string {
  if (kind === "onchain") {
    return status === "none" ? "not on-chain" : status;
  }
  if (kind === "type") {
    return getResourceTypeLabel(status);
  }
  return status;
}

function badgeLabel(kind: StatusBadgeKind, text: string): string {
  if (kind === "onchain") return `On-chain: ${text}`;
  if (kind === "type") return `Type: ${text}`;
  return `Verification: ${text}`;
}

function badgeTone(kind: StatusBadgeKind, status: string, colors: ThemeColors) {
  if (kind === "verification") {
    switch (status) {
      case "verified":
        return { backgroundColor: colors.successBg, color: colors.success };
      case "rejected":
        return { backgroundColor: colors.dangerBg, color: colors.danger };
      default:
        return { backgroundColor: colors.neutralBg, color: colors.textMuted };
    }
  }

  if (kind === "onchain") {
    switch (status) {
      case "registered":
        return { backgroundColor: colors.primaryMuted, color: colors.primary };
      case "pending":
        return { backgroundColor: colors.warningBg, color: colors.warning };
      case "failed":
        return { backgroundColor: colors.dangerBg, color: colors.danger };
      default:
        return { backgroundColor: colors.neutralBg, color: colors.textSubtle };
    }
  }

  return { backgroundColor: colors.neutralBg, color: colors.textMuted };
}

export function StatusBadge({ kind, status }: StatusBadgeProps) {
  const { colors, shared } = useAppTheme();
  const text = badgeText(kind, status);
  const tone = badgeTone(kind, status, colors);
  const icon = ICONS[status];

  return (
    <View
      style={[shared.badge, styles.badge, { backgroundColor: tone.backgroundColor }]}
      accessibilityRole="text"
      accessibilityLabel={badgeLabel(kind, text)}
    >
      {icon ? (
        <Text style={[shared.badgeText, { color: tone.color }]}>{icon}</Text>
      ) : null}
      <Text style={[shared.badgeText, { color: tone.color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
