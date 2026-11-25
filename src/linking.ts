import type { LinkingOptions } from "@react-navigation/native";

import { getApiBaseUrl } from "./api/resources";
import type { RootStackParamList } from "./navigation";
import { parseResourceId } from "./utils/resourceLinks";
import { logError } from "./utils/errorLogger";
import { parseReferralPath, recordReferral, startReferralTracking } from "./services/referrals";

export const MINDVAULT_SCHEME = "mindvault://";

/**
 * Builds the navigation linking config for both the `mindvault://` custom
 * scheme (declared in app.json) and the currently configured API host, so
 * `https://<api-host>/resources/:id` links route too.
 *
 * A custom `getStateFromPath` reuses `parseResourceId` — the same parser the
 * QR scanner uses — so deep links and scanned links accept exactly the same
 * URL shapes.
 */
export function createLinkingOptions(
  apiBaseUrl: string = getApiBaseUrl()
): LinkingOptions<RootStackParamList> {
  const apiPrefix = apiBaseUrl.trim().replace(/\/+$/, "");
  // The linking config is built once at app start, so purchases are watched from launch.
  startReferralTracking();

  return {
    prefixes: [MINDVAULT_SCHEME, apiPrefix],
    getStateFromPath: (path) => {
      const normalized = path.replace(/^\/+/, "");
      // `ref/<CODE>` records the referrer, then opens the catalog. Checked first
      // so it can never shadow a `resources/<id>` link.
      const referralCode = parseReferralPath(normalized);
      if (referralCode) {
        recordReferral(referralCode).catch((err) => logError("linking.referral", err));
        return { routes: [{ name: "Catalog" as const }] };
      }
      // Rebuild a full URL so the shared parser can handle it. Relative
      // paths (stripped from `mindvault://…` by React Navigation) belong
      // to the custom scheme; anything else is treated as an API-host path.
      const url = normalized.startsWith("resources/")
        ? `${MINDVAULT_SCHEME}${normalized}`
        : `${apiPrefix}/${normalized}`;

      const resourceId = parseResourceId(url);
      if (!resourceId) return undefined;

      return {
        routes: [
          { name: "Catalog" as const },
          { name: "ResourceDetail" as const, params: { resourceId } },
        ],
      };
    },
  };
}
