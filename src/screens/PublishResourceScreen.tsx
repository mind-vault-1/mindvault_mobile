import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { signPaymentTransaction, sorobanRpcUrl, type PaymentChallenge } from "../api/payment";
import {
  DESCRIPTION_MAX_LENGTH,
  pollPublishStatus,
  publishLink,
  validatePublishLink,
  type PublishLinkErrors,
  type PublishLinkInput,
  type PublishStatus,
} from "../api/publish";
import { SignTransactionSheet } from "../components/SignTransactionSheet";
import { useToast } from "../components/ToastProvider";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import type { RootStackParamList } from "../navigation";
import {
  enqueueMutation,
  retryMutation,
  subscribeMutations,
  type QueuedMutation,
} from "../services/mutationQueue";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import type { Resource } from "../types";

type Navigation = NativeStackNavigationProp<RootStackParamList, "PublishResource">;

const EMPTY_FORM: PublishLinkInput = { title: "", url: "", price: "", description: "" };

type Field = keyof PublishLinkInput;

const FIELDS: {
  key: Field;
  label: string;
  placeholder: string;
  keyboardType?: "url" | "decimal-pad";
  multiline?: boolean;
}[] = [
  { key: "title", label: "Title", placeholder: "Stellar handbook" },
  { key: "url", label: "URL", placeholder: "https://example.com/resource", keyboardType: "url" },
  { key: "price", label: "Price (USDC)", placeholder: "1.00", keyboardType: "decimal-pad" },
  {
    key: "description",
    label: "Description (optional)",
    placeholder: "What buyers get",
    multiline: true,
  },
];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { padding: spacing.lg, gap: spacing.md },
    intro: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    field: { gap: spacing.xs },
    label: { color: colors.text, fontSize: 13, fontWeight: "600" },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    multiline: { minHeight: 96, textAlignVertical: "top" },
    invalid: { borderColor: colors.danger },
    fieldError: { color: colors.danger, fontSize: 12 },
    banner: {
      color: colors.danger,
      backgroundColor: colors.dangerBg,
      padding: spacing.md,
      borderRadius: 12,
    },
    card: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
    muted: { color: colors.textMuted, fontSize: 13 },
    mono: { color: colors.text, fontFamily: "monospace", fontSize: 12 },
    timelineCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    timelineTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    timelineStep: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: 4,
    },
    timelineIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    timelineIndicatorDone: {
      backgroundColor: colors.primary,
    },
    timelineIndicatorCurrent: {
      backgroundColor: colors.primary,
      opacity: 0.7,
    },
    timelineIndicatorPending: {
      backgroundColor: colors.border,
    },
    timelineIndicatorRejected: {
      backgroundColor: colors.danger,
    },
    timelineStepText: {
      fontSize: 13,
      color: colors.textMuted,
    },
    timelineStepTextActive: {
      color: colors.text,
      fontWeight: "600",
    },
    actions: { flexDirection: "row", gap: spacing.sm },
    button: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    buttonText: { color: colors.onPrimary, fontWeight: "700" },
    secondary: { backgroundColor: colors.neutralBg },
    secondaryText: { color: colors.text, fontWeight: "600" },
    disabled: { opacity: 0.5 },
  });
}

export function PublishResourceScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Navigation>();
  const toast = useToast();
  const { isOffline } = useNetworkStatus();

  const [form, setForm] = useState<PublishLinkInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<PublishLinkErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fee, setFee] = useState<{ challenge: PaymentChallenge; amount: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [published, setPublished] = useState<Resource | null>(null);
  const [timelineStatus, setTimelineStatus] = useState<PublishStatus>({ status: "submitted" });
  const [queued, setQueued] = useState<QueuedMutation | null>(null);
  const [queuedDone, setQueuedDone] = useState(false);
  const queuedRef = useRef<QueuedMutation | null>(null);

  // Keep the Queued card in sync with the offline queue (retry status, replay).
  useEffect(() => {
    return subscribeMutations((mutations) => {
      const current = queuedRef.current;
      if (!current) return;
      const updated = mutations.find((entry) => entry.id === current.id);
      if (updated) {
        queuedRef.current = updated;
        setQueued(updated);
      } else {
        // The queue removes entries once they replay successfully.
        queuedRef.current = null;
        setQueued(null);
        setQueuedDone(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!published) return;
    let cancelled = false;
    setTimelineStatus({ status: "submitted" });

    void pollPublishStatus(
      published.id,
      (status) => {
        if (!cancelled) setTimelineStatus(status);
      },
      () => cancelled
    );

    return () => {
      cancelled = true;
    };
  }, [published]);

  function update(key: Field, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function publishIdempotencyKey(): string {
    return [
      "publish",
      form.title.trim(),
      form.url.trim(),
      form.price.trim(),
      form.description.trim(),
    ].join("|");
  }

  async function submit(payment?: { challenge: PaymentChallenge; transaction: string }) {
    setSubmitError(null);
    if (isOffline) {
      // Offline: persist the action — the UI shows "Queued", never a spinner.
      const entry = await enqueueMutation({
        kind: "publish",
        payload: { input: form, payment, title: form.title.trim() },
        idempotencyKey: publishIdempotencyKey(),
      });
      queuedRef.current = entry;
      setQueued(entry);
      setQueuedDone(false);
      return;
    }
    setSubmitting(true);
    try {
      const result = await publishLink(form, payment);
      if (result.type === "payment") {
        setFee({ challenge: result.challenge, amount: result.fee });
        return;
      }
      setFee(null);
      setPublished(result.resource);
      toast.success("Resource published");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to publish resource");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit() {
    const found = validatePublishLink(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void submit();
  }

  async function copyAccessUrl(url: string) {
    await Clipboard.setStringAsync(url);
    toast.success("Access URL copied");
  }

  function reset() {
    setForm(EMPTY_FORM);
    setErrors({});
    setFee(null);
    setPublished(null);
    setSubmitError(null);
    setTimelineStatus({ status: "submitted" });
    queuedRef.current = null;
    setQueued(null);
    setQueuedDone(false);
  }

  async function handleRetry() {
    const entry = queuedRef.current;
    if (!entry) return;
    await retryMutation(entry.id);
  }

  if (queued) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card} accessibilityLabel="Queued publish">
          <Text style={styles.muted}>Queued</Text>
          <Text style={styles.cardTitle}>{form.title}</Text>
          <Text style={styles.muted}>
            Saved on this device. It will be published automatically when you're back online.
          </Text>
          {queued.status === "failed" ? (
            <>
              <Text accessibilityRole="alert" style={styles.banner}>
                {queued.lastError ?? "Publish failed."}
              </Text>
              <Pressable
                style={styles.button}
                onPress={() => void handleRetry()}
                accessibilityRole="button"
                accessibilityLabel="Retry queued publish"
              >
                <Text style={styles.buttonText}>Retry</Text>
              </Pressable>
            </>
          ) : null}
        </View>
        <Pressable
          style={[styles.button, styles.secondary]}
          onPress={reset}
          accessibilityRole="button"
          accessibilityLabel="Publish another"
        >
          <Text style={styles.secondaryText}>Publish another</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (queuedDone && !published) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card} accessibilityLabel="Published resource">
          <Text style={styles.muted}>Published</Text>
          <Text style={styles.cardTitle}>{form.title}</Text>
          <Text style={styles.muted}>Published from your queued action.</Text>
        </View>
        <Pressable
          style={[styles.button, styles.secondary]}
          onPress={reset}
          accessibilityRole="button"
          accessibilityLabel="Publish another"
        >
          <Text style={styles.secondaryText}>Publish another</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (published) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card} accessibilityLabel="Published resource">
          <Text style={styles.muted}>Published</Text>
          <Text style={styles.cardTitle}>{published.title}</Text>
          <Text style={styles.muted}>Price: {published.price} USDC</Text>
          <Text style={styles.muted}>Access URL</Text>
          <Text style={styles.mono} selectable>
            {published.accessUrl}
          </Text>
        </View>

        <View style={styles.timelineCard} accessibilityRole="summary" accessibilityLabel="Publish Status Timeline">
          <Text style={styles.timelineTitle}>Publish Progress</Text>

          <View style={styles.timelineStep}>
            <View style={[styles.timelineIndicator, styles.timelineIndicatorDone]} />
            <Text style={[styles.timelineStepText, styles.timelineStepTextActive]}>1. Submitted</Text>
          </View>

          <View style={styles.timelineStep}>
            <View
              style={[
                styles.timelineIndicator,
                timelineStatus.status === "verifying"
                  ? styles.timelineIndicatorCurrent
                  : timelineStatus.status === "submitted"
                  ? styles.timelineIndicatorPending
                  : styles.timelineIndicatorDone,
              ]}
            />
            <Text
              style={[
                styles.timelineStepText,
                ["verifying", "verified", "on-chain"].includes(timelineStatus.status) && styles.timelineStepTextActive,
              ]}
            >
              2. Verifying
            </Text>
          </View>

          <View style={styles.timelineStep}>
            <View
              style={[
                styles.timelineIndicator,
                timelineStatus.status === "rejected"
                  ? styles.timelineIndicatorRejected
                  : ["verified", "on-chain"].includes(timelineStatus.status)
                  ? styles.timelineIndicatorDone
                  : styles.timelineIndicatorPending,
              ]}
            />
            <Text
              style={[
                styles.timelineStepText,
                ["verified", "rejected", "on-chain"].includes(timelineStatus.status) && styles.timelineStepTextActive,
              ]}
            >
              3. {timelineStatus.status === "rejected" ? "Verification Rejected" : "Verified"}
            </Text>
          </View>

          <View style={styles.timelineStep}>
            <View
              style={[
                styles.timelineIndicator,
                timelineStatus.status === "on-chain"
                  ? styles.timelineIndicatorDone
                  : styles.timelineIndicatorPending,
              ]}
            />
            <Text
              style={[
                styles.timelineStepText,
                timelineStatus.status === "on-chain" && styles.timelineStepTextActive,
              ]}
            >
              4. On-chain sync {timelineStatus.status === "on-chain" ? "✓" : ""}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={() => void copyAccessUrl(published.accessUrl)}
            accessibilityRole="button"
            accessibilityLabel="Copy access URL"
          >
            <Text style={styles.secondaryText}>Copy URL</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={() => navigation.navigate("ResourceDetail", { resourceId: published.id })}
            accessibilityRole="button"
            accessibilityLabel="View resource"
          >
            <Text style={styles.buttonText}>View resource</Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.button, styles.secondary]}
          onPress={reset}
          accessibilityRole="button"
          accessibilityLabel="Publish another"
        >
          <Text style={styles.secondaryText}>Publish another</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Publish a link that buyers unlock with a USDC payment. The server may charge a
        one-time verification fee.
      </Text>

      {FIELDS.map((field) => (
        <View key={field.key} style={styles.field}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            value={form[field.key]}
            onChangeText={(value) => update(field.key, value)}
            placeholder={field.placeholder}
            placeholderTextColor={colors.textSubtle}
            keyboardType={field.keyboardType}
            autoCapitalize={field.key === "url" ? "none" : "sentences"}
            autoCorrect={field.key !== "url"}
            multiline={field.multiline}
            maxLength={field.key === "description" ? DESCRIPTION_MAX_LENGTH : undefined}
            editable={!submitting && !fee}
            accessibilityLabel={field.label}
            style={[
              styles.input,
              field.multiline ? styles.multiline : null,
              errors[field.key] ? styles.invalid : null,
            ]}
          />
          {errors[field.key] ? (
            <Text accessibilityRole="alert" style={styles.fieldError}>
              {errors[field.key]}
            </Text>
          ) : null}
        </View>
      ))}

      {submitError ? (
        <Text accessibilityRole="alert" style={styles.banner}>
          {submitError}
        </Text>
      ) : null}

      {fee ? (
        <View style={styles.card} accessibilityLabel="Verification fee">
          <Text style={styles.cardTitle}>Verification fee</Text>
          <Text style={styles.muted}>
            Publishing requires a one-time fee of {fee.amount} USDC. Sign the payment to
            continue.
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondary]}
              onPress={() => setFee(null)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Cancel fee payment"
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, submitting && styles.disabled]}
              onPress={() => setSigning(true)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel={`Pay ${fee.amount} USDC and publish`}
              accessibilityState={{ disabled: submitting, busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.buttonText}>Pay and publish</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={[styles.button, submitting && styles.disabled]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Publish resource"
          accessibilityState={{ disabled: submitting, busy: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>Publish</Text>
          )}
        </Pressable>
      )}

      {fee && signing ? (
        <SignTransactionSheet
          visible
          unsignedXdr=""
          action="publish this resource"
          sign={(secret) =>
            signPaymentTransaction(
              fee.challenge,
              secret,
              sorobanRpcUrl(Constants.expoConfig?.extra?.sorobanRpcUrl)
            )
          }
          onCancel={() => setSigning(false)}
          onSigned={async (transaction) => {
            setSigning(false);
            await submit({ challenge: fee.challenge, transaction });
          }}
        />
      ) : null}
    </ScrollView>
  );
}
