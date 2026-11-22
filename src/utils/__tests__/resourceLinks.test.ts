import { parseResourceId } from "../resourceLinks";

describe("parseResourceId", () => {
  it.each<[string, string]>([
    ["mindvault://resources/abc", "abc"],
    ["https://mindvault.app/resources/abc", "abc"],
    ["http://localhost:3000/resources/hello%20world", "hello world"],
  ])("parses %s", (url, expected) => {
    expect(parseResourceId(url)).toBe(expected);
  });

  it.each<string>([
    "",
    "mindvault://resources/",
    "mindvault://other/abc",
    "https://mindvault.app/not-resources/abc",
    "https://mindvault.app/resources/a/b",
    "not-a-url",
  ])("rejects %s", (url) => {
    expect(parseResourceId(url)).toBeNull();
  });
});
