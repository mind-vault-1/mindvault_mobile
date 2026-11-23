import * as Clipboard from "expo-clipboard";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getApiBaseUrl } from "../api/resources";
import type { Resource } from "../types";
import { getResourceTypeLabel } from "../types";
import type { CatalogLayout } from "../hooks/useLayout";
import { isImageCached, rememberImage } from "../utils/imageCache";
import { shareResource } from "../utils/shareResource";
import { hapticImpact } from "../utils/haptics";
import { useFavorite } from "../services/favorites";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { EditPriceSheet } from "./EditPriceSheet";

interface ResourceCardProps {
  resource: Resource;
  onCopyUrl: (message: string) => void;
  onRegister?: (resource: Resource) => void;
  onPress?: () => void;
  editablePrice?: boolean;
  /** Called with the new price string after a successful price edit */
  onPriceUpdated?: (resourceId: string, newPrice: string) => void;
  /** Called when the user taps "Transfer Ownership" */
  onTransferOwnership?: (resource: Resource) => void;
  /** Called when the user taps "Delist" */
  onDelist?: (resource: Resource) => void;
  /** `grid` squeezes the card into a narrow multi-column cell. */
  layout?: CatalogLayout;
}

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function verificationStyle(status: Resource["verificationStatus"], colors: ThemeColors) {
  switch (status) {
    case "verified":
      return { backgroundColor: colors.successBg, color: colors.success };
    case "rejected":
      return { backgroundColor: colors.dangerBg, color: colors.danger };
    default:
      return { backgroundColor: colors.neutralBg, color: colors.textMuted };
  }
}

function onchainStyle(status: Resource["onchainStatus"], colors: ThemeColors) {
  switch (status) {
    case "registered":
      return { backgroundColor: colors.primaryMuted, color: colors.primary };
    case "failed":
      return { backgroundColor: colors.dangerBg, color: colors.danger };
    case "pending":
      return { backgroundColor: colors.warningBg, color: colors.warning };
    default:
      return { backgroundColor: colors.neutralBg, color: colors.textSubtle };
  }
}

/**
 * The image to show for a resource: the server's `thumbnailUrl` when it sends one,
 * otherwise the public thumbnail endpoint for image resources.
 */
export function getResourceThumbnailUri(resource: Resource): string | null {
  if (resource.thumbnailUrl) return resource.thumbnailUrl;
  if (resource.mimeType?.toLowerCase().startsWith("image/")) {
    return `${getApiBaseUrl()}/resources/${encodeURIComponent(resource.id)}/thumbnail`;
  }
  return null;
}

const TYPE_ICONS: Record<string, string> = {
  file: "📄",
  link: "🔗",
};

/**
 * A fixed-aspect-ratio image with a themed placeholder while it loads. The box
 * size never changes, so swapping the placeholder for the image causes no layout
 * shift. A thumbnail already in the image cache renders straight away (also
 * offline); if it fails to load, the resource-type icon is shown instead.
 */
export function ResourceThumbnail({
  uri,
  title,
  resourceType,
}: {
  uri: string;
  title: string;
  resourceType: string;
}) {
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(() =>
    isImageCached(uri) ? "loaded" : "loading"
  );

  if (status === "failed") {
    return (
      <View
        style={[styles.thumbnail, { backgroundColor: colors.neutralBg }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${getResourceTypeLabel(resourceType)} icon for ${title}`}
      >
        <Text style={styles.fallbackIcon}>{TYPE_ICONS[resourceType] ?? "📎"}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.thumbnail, { backgroundColor: colors.neutralBg }]}>
      {status === "loading" ? <ActivityIndicator color={colors.textSubtle} /> : null}
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        progressiveRenderingEnabled
        fadeDuration={150}
        accessibilityRole="image"
        accessibilityLabel={`Thumbnail of ${title}`}
        onLoad={() => {
          rememberImage(uri);
          setStatus("loaded");
        }}
        onError={() => setStatus("failed")}
      />
    </View>
  );
}

/**
 * Heart toggle that saves a resource on this device. State comes from the shared
 * favourites store, so every card and the detail screen stay in step.
 */
export function FavoriteButton({
  resourceId,
  title,
}: {
  resourceId: string;
  title: string;
}) {
  const { colors } = useAppTheme();
  const { isFavorite, toggle } = useFavorite(resourceId);

  return (
    <Pressable
      onPress={() => {
        void hapticImpact();
        void toggle();
      }}
      hitSlop={8}
      style={styles.favoriteButton}
      accessibilityRole="togglebutton"
      accessibilityLabel={`Favourite ${title}`}
      accessibilityHint="Saves this resource on this device"
      accessibilityState={{ checked: isFavorite }}
    >
      <Text
        style={[styles.favoriteIcon, { color: isFavorite ? colors.danger : colors.textMuted }]}
        accessible={false}
      >
        {isFavorite ? "♥" : "♡"}
      </Text>
    </Pressable>
  );
}

export function ResourceCard({
  resource,
  onCopyUrl,
  onRegister,
  onPress,
  editablePrice = false,
  onPriceUpdated,
  onTransferOwnership,
  onDelist,
  layout = "list",
}: ResourceCardProps) {
  const { colors, shared, typography } = useAppTheme();
  const isGrid = layout === "grid";
  const verification = verificationStyle(resource.verificationStatus, colors);
  const onchain = onchainStyle(resource.onchainStatus, colors);
  const thumbnailUri = getResourceThumbnailUri(resource);
  const [priceSheetVisible, setPriceSheetVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        shareButton: {
          backgroundColor: colors.primary,
        },
        successText: {
          color: colors.success,
          fontSize: 13,
        },
        transferButton: {
          backgroundColor: colors.neutralBg,
          marginTop: 8,
        },
        registerButton: {
          backgroundColor: colors.neutralBg,
          marginTop: 8,
        },
        delistButton: {
          backgroundColor: colors.dangerBg,
          marginTop: 8,
        },
        delistButtonText: {
          color: colors.danger,
        },
      }),
    [colors]
  );

  async function handleCopy() {
    await Clipboard.setStringAsync(resource.accessUrl);
    void hapticImpact();
    onCopyUrl("Resource URL copied");
  }

  async function handleShare() {
    const outcome = await shareResource(resource.title, resource.accessUrl);
    if (outcome === "error") {
      onCopyUrl("Unable to share resource. Please try copying the URL instead.");
    }
  }

  const canRegister =
    Boolean(onRegister) &&
    resource.verificationStatus === "verified" &&
    (resource.onchainStatus === "none" || resource.onchainStatus === "failed");

  return (
    <View style={shared.card}>
      {thumbnailUri ? (
        // Keyed by URI, so a new image starts with its own placeholder and error state.
        <ResourceThumbnail
          key={thumbnailUri}
          uri={thumbnailUri}
          title={resource.title}
          resourceType={resource.resourceType}
        />
      ) : null}
      <Text style={typography.cardTitle} numberOfLines={isGrid ? 2 : undefined}>
        {resource.title}
      </Text>

      {resource.publisherName ? (
        <Text style={typography.body}>by {resource.publisherName}</Text>
      ) : null}

      <Text style={typography.caption}>
        Owner: {shortenAddress(resource.walletAddress)}
      </Text>
      {resource.onchainTxHash ? (
        <Text
          style={typography.caption}
          accessibilityLabel={`Transaction: ${resource.onchainTxHash}`}
        >
          Tx: {shortenAddress(resource.onchainTxHash)}
        </Text>
      ) : null}

      <View style={styles.badges}>
        <View style={[shared.badge, { backgroundColor: colors.neutralBg }]}>
          <Text style={[shared.badgeText, { color: colors.textMuted }]}>
            {getResourceTypeLabel(resource.resourceType)}
          </Text>
        </View>
        <View
          style={[shared.badge, { backgroundColor: verification.backgroundColor }]}
          accessibilityRole="text"
          accessibilityLabel={`Verification: ${resource.verificationStatus}`}
        >
          <Text style={[shared.badgeText, { color: verification.color }]}>
            {resource.verificationStatus}
          </Text>
        </View>
        <View
          style={[shared.badge, { backgroundColor: onchain.backgroundColor }]}
          accessibilityRole="text"
          accessibilityLabel={`On-chain: ${resource.onchainStatus === "none" ? "not on-chain" : resource.onchainStatus}`}
        >
          <Text style={[shared.badgeText, { color: onchain.color }]}>
            {resource.onchainStatus === "none" ? "not on-chain" : resource.onchainStatus}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, isGrid && styles.footerGrid]}>
        <Text style={typography.price}>{resource.price} USDC</Text>
        <View style={styles.actions}>
          <FavoriteButton resourceId={resource.id} title={resource.title} />
          <Pressable
            onPress={handleShare}
            style={[shared.button, dynamicStyles.shareButton, isGrid && styles.gridButton]}
            accessibilityRole="button"
            accessibilityLabel={`Share ${resource.title}`}
            accessibilityHint="Opens the share sheet with the resource title and URL"
          >
            <Text style={[shared.buttonText, styles.primaryButtonText]}>Share</Text>
          </Pressable>
          <Pressable
            onPress={handleCopy}
            style={[shared.button, isGrid && styles.gridButton]}
            accessibilityRole="button"
            accessibilityLabel={`Copy URL for ${resource.title}`}
            accessibilityHint="Copies the resource access URL to your clipboard"
          >
            <Text style={shared.buttonText}>Copy URL</Text>
          </Pressable>
        </View>
      </View>

      {editablePrice || canRegister || onTransferOwnership || onDelist ? (
        <View style={styles.publisherActions}>
          {editablePrice ? (
            <Pressable
              onPress={() => {
                setSuccessMessage(null);
                setPriceSheetVisible(true);
              }}
              style={shared.button}
              accessibilityRole="button"
              accessibilityLabel={`Edit price for ${resource.title}`}
              accessibilityHint="Opens the price editor for this resource"
            >
              <Text style={shared.buttonText}>Edit price</Text>
            </Pressable>
          ) : null}

          {canRegister ? (
            <Pressable
              onPress={() => onRegister?.(resource)}
              style={[shared.button, dynamicStyles.registerButton]}
              accessibilityRole="button"
              accessibilityLabel={`Register ${resource.title} on-chain`}
              accessibilityHint="Opens the on-chain registration flow for this resource"
            >
              <Text style={shared.buttonText}>Register on-chain</Text>
            </Pressable>
          ) : null}

          {onTransferOwnership ? (
            <Pressable
              onPress={() => onTransferOwnership(resource)}
              style={[shared.button, dynamicStyles.transferButton]}
              accessibilityRole="button"
              accessibilityLabel={`Transfer ownership of ${resource.title}`}
              accessibilityHint="Opens the ownership transfer flow for this resource"
            >
              <Text style={shared.buttonText}>Transfer Ownership</Text>
            </Pressable>
          ) : null}

          {onDelist ? (
            <Pressable
              onPress={() => onDelist(resource)}
              style={[shared.button, dynamicStyles.delistButton]}
              accessibilityRole="button"
              accessibilityLabel={`Delist ${resource.title}`}
              accessibilityHint="Opens a confirmation before removing this resource from the catalog"
            >
              <Text style={[shared.buttonText, dynamicStyles.delistButtonText]}>Delist</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {successMessage ? (
        <Text
          style={dynamicStyles.successText}
          accessibilityLiveRegion="polite"
          accessibilityRole="none"
        >
          {successMessage}
        </Text>
      ) : null}
      <EditPriceSheet
        visible={priceSheetVisible}
        resourceId={resource.id}
        resourceTitle={resource.title}
        oldPrice={resource.price}
        onClose={() => setPriceSheetVisible(false)}
        onUpdated={(newPrice) => {
          setSuccessMessage("Price updated successfully.");
          onPriceUpdated?.(resource.id, newPrice);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackIcon: {
    fontSize: 32,
  },
  favoriteButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteIcon: {
    fontSize: 24,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  footerGrid: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: "#ffffff",
  },
  publisherActions: {
    marginTop: 12,
    gap: 8,
  },
  gridButton: {
    flex: 1,
  },
});
