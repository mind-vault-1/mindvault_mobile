import { CameraView, useCameraPermissions } from "expo-camera";
import { useMemo, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation";
import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";

const RESOURCE_URL_RE = /\/resources\/([^\/?#\s]+)/;

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
  });
}

export function ScannerScreen({ navigation }: ScannerScreenProps) {
  const { colors, shared, typography } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

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

    Alert.alert(
      "Unrecognized Code",
      "This QR code does not contain a valid resource URL.",
      [
        { text: "Try Again", onPress: () => setScanned(false) },
        { text: "Cancel", onPress: () => navigation.goBack() },
      ],
    );
  }

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
        <Text style={styles.hint}>Point at a QR code</Text>
      </View>
    </View>
  );
}
