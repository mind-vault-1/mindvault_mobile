import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  appendAuditLogEntry,
  getAuditLog,
  clearAuditLog,
  exportAuditLog,
} from "./auditLog";

jest.mock("@react-native-async-storage/async-storage");

describe("auditLog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("appendAuditLogEntry", () => {
    it("appends a new entry to the audit log", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendAuditLogEntry("key_rotation", "success");

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        "mindvault:auditLog",
        expect.stringContaining('"action":"key_rotation"')
      );
    });

    it("appends without exposing secrets in metadata", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendAuditLogEntry("wallet_wipe", "success", {
        walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      });

      const call = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const logData = JSON.parse(call[1]);
      expect(logData[0].metadata?.walletAddress).toBe("GBXX...XXXX");
    });

    it("maintains append-only behavior by preserving existing entries", async () => {
      const existingLog = [
        {
          id: "1",
          action: "key_rotation" as const,
          timestamp: "2026-11-20T00:00:00Z",
          outcome: "success" as const,
        },
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify(existingLog)
      );
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendAuditLogEntry("wallet_wipe", "failure", {
        errorMessage: "Insufficient balance",
      });

      const call = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const logData = JSON.parse(call[1]);
      expect(logData).toHaveLength(2);
      expect(logData[0]).toEqual(existingLog[0]);
      expect(logData[1].action).toBe("wallet_wipe");
    });

    it("sets timestamp and outcome on entries", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendAuditLogEntry("signing", "success");

      const call = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const logData = JSON.parse(call[1]);
      expect(logData[0].timestamp).toBeDefined();
      expect(logData[0].outcome).toBe("success");
    });
  });

  describe("getAuditLog", () => {
    it("returns an empty array when no log exists", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const log = await getAuditLog();
      expect(log).toEqual([]);
    });

    it("returns parsed log entries", async () => {
      const mockLog = [
        {
          id: "1",
          action: "key_rotation",
          timestamp: "2026-11-20T00:00:00Z",
          outcome: "success",
        },
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify(mockLog)
      );

      const log = await getAuditLog();
      expect(log).toEqual(mockLog);
    });

    it("returns empty array on parsing error", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue("invalid json");
      const log = await getAuditLog();
      expect(log).toEqual([]);
    });
  });

  describe("clearAuditLog", () => {
    it("removes the audit log from storage", async () => {
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

      await clearAuditLog();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith("mindvault:auditLog");
    });
  });

  describe("exportAuditLog", () => {
    it("exports log as formatted JSON string", async () => {
      const mockLog = [
        {
          id: "1",
          action: "key_rotation",
          timestamp: "2026-11-20T00:00:00Z",
          outcome: "success",
        },
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify(mockLog)
      );

      const exported = await exportAuditLog();

      expect(exported).toContain('"action": "key_rotation"');
      expect(exported).toContain('"outcome": "success"');
    });

    it("returns an empty log export when storage read fails", async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(
        new Error("Storage error")
      );

      const exported = await exportAuditLog();

      expect(exported).toBe("[]");
    });
  });
});
