// @ts-nocheck
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

/**
 * Matches a MindVault resource URL anchored to its scheme and host.
 * Accepts:
 *   - https://example.com/resources/<id>
 *   - http://example.com/resources/<id>
 *   - mindvault://resources/<id>  (deep-link, host is optional)
 */
const RESOURCE_URL_RE =
  /^(?:https?:\/\/[^\/?#\s]+|mindvault:\/\/[^\/?#\s]*)\/resources\/([^\/?#\s]+)/i;

interface ScannerScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Scanner">;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
      backgroundColor: colors.background,
      gap: spacing.md,
    },
    heading: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    permissionBody: {
      textAlign: "center",
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
    },
    viewfinder: {
      width: 250,
      height: 250,
    },
    corner: {
      position: "absolute",
      width: 30,
      height: 30,
      borderColor: "#ffffff",
    },
    cornerTopLeft: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 4,
    },
    cornerTopRight: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 4,
    },
    cornerBottomLeft: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 4,
    },
    cornerBottomRight: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 4,
    },
    hint: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "500",
      marginTop: spacing.xl,
    },
    errorBanner: {
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: "rgba(200, 30, 30, 0.85)",
      borderRadius: 8,
      maxWidth: 280,
    },
    errorText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "600",
      textAlign: "center",
    },
    pasteButton: {
      marginTop: spacing.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#ffffff",
    },
    pasteButtonText: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "600",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: spacing.lg,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    modalLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 13,
      color: colors.text,
    },
    modalInputError: {
      borderColor: colors.danger,
    },
    modalErrorText: {
      fontSize: 13,
      color: colors.danger,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      padding: 8,
    },
    modalActions: {
      flexDirection: "row",
      gap: 8,
    },
    modalCancelButton: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 12,
    },
    modalCancelText: {
      color: colors.text,
      fontWeight: "600",
    },
    modalConfirmButton: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 12,
    },
    modalDisabledButton: {
      opacity: 0.5,
    },
    modalPasteInlineButton: {
      alignSelf: "flex-start",
    },
    modalPasteInlineText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "600",
    },
  });
}

export function ScannerScreen({ navigation }: ScannerScreenProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pasteModalVisible, setPasteModalVisible] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  function handleBarcodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);

    const match = data.match(RESOURCE_URL_RE);
    if (match) {
      navigation.replace("ResourceDetail", { resourceId: match[1] });
      return;
    }

    if (data.startsWith("http://") || data.startsWith("https://")) {
      Alert.alert("Open URL", data, [
        { text: "Cancel", onPress: () => setScanned(false) },
        {
          text: "Open",
          onPress: () => {
            Linking.openURL(data).catch(() => {});
            navigation.goBack();
          },
        },
      ]);
      return;
    }

    // Non-blocking inline error — auto-resumes scanning after 2.5 s
    setScanError("Unrecognized QR code. Point at a MindVault resource code.");
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      setScanError(null);
      setScanned(false);
    }, 2500);
  }

  function openPasteModal() {
    setPasteValue("");
    setPasteError(null);
    setPasteModalVisible(true);
  }

  function closePasteModal() {
    setPasteModalVisible(false);
    setPasteValue("");
    setPasteError(null);
  }

  async function handlePasteFromClipboard() {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setPasteValue(text.trim());
      setPasteError(null);
    }
  }

  function handleSubmitPastedUrl() {
    const trimmed = pasteValue.trim();
    if (!trimmed) {
      setPasteError("Enter or paste a MindVault resource URL.");
      return;
    }

    const match = trimmed.match(RESOURCE_URL_RE);
    if (match) {
      closePasteModal();
      navigation.replace("ResourceDetail", { resourceId: match[1] });
      return;
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      closePasteModal();
      Alert.alert("Open URL", trimmed, [
        { text: "Cancel" },
        {
          text: "Open",
          onPress: () => {
            Linking.openURL(trimmed).catch(() => {});
          },
        },
      ]);
      return;
    }

    setPasteError("This doesn't look like a valid MindVault resource URL.");
  }

  const pasteModal = (
    <Modal
      visible={pasteModalVisible}
      transparent
      animationType="slide"
      onRequestClose={closePasteModal}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={typography.title}>Enter Resource Link</Text>
          <Text style={styles.modalLabel}>MindVault Resource URL</Text>
          <TextInput
            value={pasteValue}
            onChangeText={(text) => {
              setPasteValue(text);
              setPasteError(null);
            }}
            placeholder="https://mindvault.app/resources/…"
            placeholderTextColor={colors.textSubtle}
            style={[styles.modalInput, pasteError ? styles.modalInputError : null]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable
            onPress={() => void handlePasteFromClipboard()}
            style={styles.modalPasteInlineButton}
          >
            <Text style={styles.modalPasteInlineText}>Paste from Clipboard</Text>
          </Pressable>
          {pasteError ? (
            <Text style={styles.modalErrorText}>{pasteError}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <Pressable
              onPress={closePasteModal}
              style={[shared.button, styles.modalCancelButton]}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmitPastedUrl}
              style={[
                shared.button,
                styles.modalConfirmButton,
                { backgroundColor: colors.primary },
                pasteValue.trim().length === 0 ? styles.modalDisabledButton : null,
              ]}
              disabled={pasteValue.trim().length === 0}
            >
              <Text style={shared.buttonText}>Go</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={typography.body}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.heading}>Camera access is required</Text>
        <Text style={[typography.body, styles.permissionBody]}>
          MindVault needs camera permission to scan QR codes.
        </Text>
        <Pressable
          style={[shared.button, shared.primaryButton]}
          onPress={requestPermission}
        >
          <Text style={[shared.buttonText, shared.primaryButtonText]}>
            Grant Permission
          </Text>
        </Pressable>
        <Pressable onPress={openPasteModal}>
          <Text style={[typography.body, { color: colors.primary, fontWeight: "600" }]}>
            Paste a resource link instead
          </Text>
        </Pressable>
        {pasteModal}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      />
      <View style={styles.overlay}>
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
        <Text style={styles.hint}>
          {scanError ? "" : "Point at a QR code"}
        </Text>
        {scanError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{scanError}</Text>
          </View>
        ) : null}
        <Pressable style={styles.pasteButton} onPress={openPasteModal}>
          <Text style={styles.pasteButtonText}>Paste Link Instead</Text>
        </Pressable>
      </View>
      {pasteModal}
    </View>
  );
}
