import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const SOURCE_ROOTS = ["src/screens", "src/components"];
const COLOR_LITERAL = /['"](#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))['"]/g;

const ALLOWED: Record<string, string[]> = {
  "src/screens/CatalogScreen.tsx": ["#000", "#ffffff"],
  "src/screens/DevSignerScreen.tsx": ["#ffffff"],
  "src/screens/PublisherResourceDetailScreen.tsx": ["rgba(0,0,0,0.5)", "#ffffff"],
  "src/screens/PublisherResourcesScreen.tsx": [
    "#fecaca",
    "#fef2f2",
    "rgba(0,0,0,0.5)",
    "#ffffff",
  ],
  "src/screens/PurchaseHistoryScreen.tsx": ["#ffffff", "rgba(0,0,0,0.5)"],
  "src/screens/ReceiptDetailScreen.tsx": ["#ffffff"],
  "src/screens/ResourceDetailScreen.tsx": ["#fee2e2"],
  "src/screens/SettingsScreen.tsx": ["#ffffff", "rgba(0,0,0,0.5)"],
  "src/screens/WalletScreen.tsx": ["#fff", "#ffffff", "#000000"],
  "src/components/EditPriceSheet.tsx": ["rgba(0,0,0,0.5)", "#ffffff"],
  "src/components/LeaseSheet.tsx": ["rgba(0,0,0,0.45)", "#ffffff"],
  "src/components/OfflineBanner.tsx": ["#ffffff"],
  "src/components/PaywallModal.tsx": ["rgba(0,0,0,0.45)"],
  "src/components/PublisherSignupSheet.tsx": ["rgba(0,0,0,0.5)", "#ffffff"],
  "src/components/ReceiptExportButton.tsx": ["#ffffff"],
  "src/components/RegisterModal.tsx": ["rgba(0, 0, 0, 0.5)", "#000"],
  "src/components/ResourceCard.tsx": ["#ffffff"],
  "src/components/ResourceQrSheet.tsx": ["#ffffff", "#000000", "rgba(0,0,0,0.4)"],
  "src/components/SignTransactionSheet.tsx": ["rgba(0,0,0,0.5)", "#fff"],
  "src/components/TransferOwnershipModal.tsx": ["rgba(0,0,0,0.5)"],
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) return [];
    return [path];
  });
}

describe("hard-coded colours", () => {
  it("does not introduce new colour literals in screens or components", () => {
    const violations: string[] = [];

    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(root)) {
        const allowed = ALLOWED[file] ?? [];
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(COLOR_LITERAL)) {
          if (!allowed.includes(match[1])) violations.push(`${file}: ${match[1]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
