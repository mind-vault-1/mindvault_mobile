import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  dismissChecklist,
  getPublisherChecklist,
  isChecklistComplete,
  isChecklistDismissed,
  type ChecklistInput,
  type ChecklistStep,
} from "../services/onboarding";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { logError } from "../utils/errorLogger";

interface Props extends ChecklistInput {
  /** Opens the screen or sheet that completes the step. */
  onOpenStep: (step: ChecklistStep) => void;
}

/** Getting-started checklist shown above the publisher's resources until it is complete or dismissed. */
export function PublisherGettingStarted({ hasApiKey, resources, onOpenStep }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Hidden until storage says otherwise, so a dismissed list never flashes.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let active = true;
    void isChecklistDismissed().then((value) => { if (active) setDismissed(value); });
    return () => { active = false; };
  }, []);

  const steps = useMemo(() => getPublisherChecklist({ hasApiKey, resources }), [hasApiKey, resources]);
  if (dismissed || isChecklistComplete(steps)) return null;

  const doneCount = steps.filter((step) => step.done).length;

  function dismiss() {
    setDismissed(true);
    dismissChecklist().catch((err) => logError("PublisherGettingStarted.dismiss", err));
  }

  return (
    <View style={styles.card} accessibilityLabel="Getting started checklist" testID="publisher-getting-started">
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">
          Getting started ({doneCount}/{steps.length})
        </Text>
        <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss checklist">
          <Text style={styles.muted}>Dismiss</Text>
        </Pressable>
      </View>
      {steps.map((step) => (
        <Pressable
          key={step.id}
          style={styles.step}
          onPress={() => onOpenStep(step)}
          disabled={step.done}
          accessibilityRole="button"
          accessibilityLabel={step.label}
          accessibilityState={{ checked: step.done, disabled: step.done }}
        >
          <Text style={step.done ? styles.done : styles.todo}>{step.done ? "✓" : "○"}</Text>
          <Text style={[styles.label, step.done && styles.labelDone]}>{step.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.md,
      marginBottom: spacing.md,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { color: colors.text, fontWeight: "600" },
    muted: { color: colors.textMuted },
    step: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
    done: { color: colors.primary, fontWeight: "700" },
    todo: { color: colors.textMuted },
    label: { color: colors.primary },
    labelDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  });
}
