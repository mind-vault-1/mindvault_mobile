import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";

import { getApiBaseUrl } from "../api/resources";
import { spacing, type ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { useToast } from "./ToastProvider";

export type QrLinkMode = "app" | "web";

/**
 * The text encoded in a resource's QR code. Both shapes are accepted by
 * `parseResourceId`, so the in-app scanner reads either one.
 */
export function buildResourceQrValue(
  resourceId: string,
  mode: QrLinkMode,
  apiBaseUrl: string = getApiBaseUrl()
): string {
  const id = encodeURIComponent(resourceId);
  return mode === "app"
    ? `mindvault://resources/${id}`
    : `${apiBaseUrl.trim().replace(/\/+$/, "")}/resources/${id}`;
}

interface ResourceQrSheetProps {
  visible: boolean;
  resourceId: string;
  resourceTitle: string;
  onClose: () => void;
}

/** Bottom sheet that shows a scannable QR code for a resource, with an optional save to Photos. */
export function ResourceQrSheet({ visible, resourceId, resourceTitle, onClose }: ResourceQrSheetProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToast();
  const [mode, setMode] = useState<QrLinkMode>("app");
  const [saving, setSaving] = useState(false);
  const qrRef = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(null);

  const value = buildResourceQrValue(resourceId, mode);

  async function saveToPhotos() {
    if (saving || !qrRef.current) return;
    setSaving(true);
    let path: string | null = null;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        toast.error("Photos permission is needed to save the QR code");
        return;
      }
      const dataUrl = await new Promise<string>((resolve) => qrRef.current!.toDataURL(resolve));
      const base64 = dataUrl.replace(/^data:[^,]*,/, "");
      path = `${FileSystem.cacheDirectory}mindvault-qr-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(path, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await MediaLibrary.saveToLibraryAsync(path);
      toast.success("QR code saved to Photos");
    } catch {
      toast.error("Unable to save the QR code");
    } finally {
      if (path) await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={typography.cardTitle} accessibilityRole="header">
            Share as QR code
          </Text>
          <Text style={typography.body} numberOfLines={2}>
            {resourceTitle}
          </Text>

          <View style={styles.toggle} accessibilityRole="radiogroup">
            {(["app", "web"] as const).map((option) => {
              const active = mode === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setMode(option)}
                  style={[styles.toggleOption, active && styles.toggleActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option === "app" ? "App link" : "Web link"}
                >
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {option === "app" ? "App link" : "Web link"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={styles.qrFrame}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`QR code for ${resourceTitle}`}
          >
            <QRCode
              value={value}
              size={220}
              backgroundColor="#ffffff"
              color="#000000"
              getRef={(ref: unknown) => {
                qrRef.current = ref as typeof qrRef.current;
              }}
            />
          </View>
          <Text style={styles.value} selectable>
            {value}
          </Text>

          <Pressable
            onPress={() => void saveToPhotos()}
            disabled={saving}
            style={[shared.button, styles.action]}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            accessibilityLabel="Save QR code to Photos"
          >
            <Text style={shared.buttonText}>{saving ? "Saving…" : "Save to Photos"}</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={[shared.button, shared.primaryButton, styles.action]}
            accessibilityRole="button"
            accessibilityLabel="Close QR code"
          >
            <Text style={[shared.buttonText, shared.primaryButtonText]}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: spacing.lg,
      gap: spacing.md,
      alignItems: "center",
    },
    toggle: {
      flexDirection: "row",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    toggleOption: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 44, justifyContent: "center" },
    toggleActive: { backgroundColor: colors.primaryMuted },
    toggleText: { fontSize: 14, fontWeight: "500", color: colors.textMuted },
    toggleTextActive: { color: colors.primary, fontWeight: "600" },
    qrFrame: { padding: spacing.md, backgroundColor: "#ffffff", borderRadius: 12 },
    value: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
    action: { alignSelf: "stretch" },
  });
}
