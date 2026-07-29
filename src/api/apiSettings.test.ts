import { validateApiBaseUrl } from "./apiSettings";

describe("validateApiBaseUrl", () => {
  it("accepts https URLs for normal API hosts", () => {
    expect(validateApiBaseUrl("https://api.example.com").isValid).toBe(true);
    expect(validateApiBaseUrl(" https://api.example.com/v1 ").isValid).toBe(true);
  });

  it("accepts localhost and loopback development URLs over http", () => {
    expect(validateApiBaseUrl("http://localhost:4021").isValid).toBe(true);
    expect(validateApiBaseUrl("http://dev.localhost:4021").isValid).toBe(true);
    expect(validateApiBaseUrl("http://127.0.0.1:4021").isValid).toBe(true);
    expect(validateApiBaseUrl("http://[::1]:4021").isValid).toBe(true);
  });

  it("accepts private LAN IP development URLs over http", () => {
    expect(validateApiBaseUrl("http://10.0.2.2:4021").isValid).toBe(true);
    expect(validateApiBaseUrl("http://172.16.0.2:4021").isValid).toBe(true);
    expect(validateApiBaseUrl("http://172.31.255.255:4021").isValid).toBe(true);
    expect(validateApiBaseUrl("http://192.168.1.20:4021").isValid).toBe(true);
  });

  it("rejects empty and incomplete URLs", () => {
    expect(validateApiBaseUrl("").isValid).toBe(false);
    expect(validateApiBaseUrl("api.example.com").isValid).toBe(false);
  });

  it("rejects unsupported protocols", () => {
    expect(validateApiBaseUrl("ftp://api.example.com").isValid).toBe(false);
  });

  it("rejects insecure http for public hosts", () => {
    expect(validateApiBaseUrl("http://api.example.com").isValid).toBe(false);
    expect(validateApiBaseUrl("http://8.8.8.8:4021").isValid).toBe(false);
    expect(validateApiBaseUrl("http://172.32.0.1:4021").isValid).toBe(false);
  });

  it("rejects credentials, query parameters, and fragments", () => {
    expect(validateApiBaseUrl("https://user:pass@api.example.com").isValid).toBe(false);
    expect(validateApiBaseUrl("https://api.example.com?debug=true").isValid).toBe(false);
    expect(validateApiBaseUrl("https://api.example.com#resources").isValid).toBe(false);
  });
});
