import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import { spacing } from "../theme";
import type { ThemeColors } from "../theme";
import { useAppTheme } from "../theme/ThemeProvider";
import { useToast } from "./ToastProvider";

export type ContentFormat = "text" | "markdown" | "json";

export interface ContentViewerProps {
  content: string;
  format?: "auto" | ContentFormat;
  testID?: string;
}

export const CONTENT_PREVIEW_CHARS = 2000;

const INLINE_PATTERN = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

export function detectContentFormat(content: string): ContentFormat {
  const trimmed = content.trim();
  if (!trimmed) return "text";

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return "text";
    }
  }

  if (
    /(^|\n)\s{0,3}(#{1,6}\s|>|[-*+]\s|\d+\.\s|```)|(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/.test(
      trimmed
    )
  ) {
    return "markdown";
  }
  return "text";
}

export function formatContent(content: string, format: ContentFormat): string {
  if (format !== "json") return content;
  try {
    return JSON.stringify(JSON.parse(content.trim()), null, 2);
  } catch {
    return content;
  }
}

function renderInline(text: string, styles: ReturnType<typeof createStyles>): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Text key={`t-${lastIndex}`} style={styles.body} selectable>{text.slice(lastIndex, match.index)}</Text>);
    }
    const token = match[0];
    const key = `m-${match.index}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<Text key={key} style={[styles.body, styles.bold]} selectable>{token.slice(2, -2)}</Text>);
    } else if (token.startsWith("_") && token.endsWith("_")) {
      nodes.push(<Text key={key} style={[styles.body, styles.italic]} selectable>{token.slice(1, -1)}</Text>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<Text key={key} style={styles.mono} selectable>{token.slice(1, -1)}</Text>);
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch && /^https?:\/\//i.test(linkMatch[2])) {
        nodes.push(
          <Text
            key={key}
            style={[styles.body, styles.link]}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(linkMatch[2]).catch(() => undefined)}
            selectable
          >
            {linkMatch[1]}
          </Text>
        );
      } else {
        nodes.push(<Text key={key} style={styles.body} selectable>{token}</Text>);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Text key={`t-${lastIndex}`} style={styles.body} selectable>{text.slice(lastIndex)}</Text>);
  }
  return nodes;
}

function renderMarkdown(content: string, styles: ReturnType<typeof createStyles>): React.ReactNode[] {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let codeLines: string[] = [];
  let codeStart = 0;

  function flushCode() {
    if (codeLines.length === 0) return;
    nodes.push(
      <View key={`code-${codeStart}`} style={styles.codeBlock}>
        <Text style={[styles.mono, styles.code]} selectable>{codeLines.join("\n")}</Text>
      </View>
    );
    codeLines = [];
  }

  lines.forEach((line, index) => {
    const key = `line-${index}`;
    if (line.trim().startsWith("```")) {
      if (codeLines.length > 0) flushCode();
      else codeStart = index;
      return;
    }
    if (codeLines.length > 0) {
      codeLines.push(line);
      return;
    }
    if (!line.trim()) {
      nodes.push(<View key={key} style={styles.spacer} />);
      return;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      nodes.push(<Text key={key} accessibilityRole="header" style={styles.heading} selectable>{heading[1]}</Text>);
      return;
    }
    const list = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (list) {
      nodes.push(<Text key={key} style={styles.listItem} selectable>• {renderInline(list[1], styles)}</Text>);
      return;
    }
    const quote = /^\s*>\s?(.+)$/.exec(line);
    if (quote) {
      nodes.push(<Text key={key} style={styles.quote} selectable>{renderInline(quote[1], styles)}</Text>);
      return;
    }
    nodes.push(<Text key={key} style={styles.paragraph} selectable>{renderInline(line, styles)}</Text>);
  });
  flushCode();
  return nodes;
}

export function ContentViewer({ content, format = "auto", testID = "content-viewer" }: ContentViewerProps) {
  const { colors, shared } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => setExpanded(false), [content]);

  const resolved = format === "auto" ? detectContentFormat(content) : format;
  const formatted = useMemo(() => formatContent(content, resolved), [content, resolved]);
  const needsShowMore = formatted.length > CONTENT_PREVIEW_CHARS;
  const visible = !needsShowMore || expanded ? formatted : `${formatted.slice(0, CONTENT_PREVIEW_CHARS)}…`;

  async function handleCopy() {
    try {
      await Clipboard.setStringAsync(formatted);
      toast.success("Content copied to clipboard");
    } catch {
      toast.error("Unable to copy content");
    }
  }

  return (
    <ScrollView
      testID={testID}
      accessibilityLabel="Unlocked content"
      style={styles.scrollArea}
      contentContainerStyle={styles.scrollContent}
    >
      {resolved === "markdown" ? (
        renderMarkdown(visible, styles)
      ) : (
        <Text style={resolved === "json" ? [styles.body, styles.mono] : styles.body} selectable>
          {visible}
        </Text>
      )}
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy content"
          accessibilityHint="Copies the full unlocked content to your clipboard"
          onPress={() => void handleCopy()}
          style={[shared.button, styles.action]}
        >
          <Text style={[shared.buttonText, styles.actionText]}>Copy content</Text>
        </Pressable>
        {needsShowMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Show less" : "Show more"}
            accessibilityHint={expanded ? "Collapses the unlocked content" : "Expands the full unlocked content"}
            onPress={() => setExpanded((value) => !value)}
            style={[shared.button, styles.action]}
          >
            <Text style={[shared.buttonText, styles.actionText]}>
              {expanded ? "Show less" : "Show more"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollArea: { flexGrow: 0 },
    scrollContent: { padding: spacing.lg, gap: spacing.sm },
    body: { fontSize: 14, lineHeight: 22, color: colors.text },
    heading: { fontSize: 18, lineHeight: 26, fontWeight: "700", color: colors.text },
    paragraph: { fontSize: 14, lineHeight: 22, color: colors.text },
    listItem: { fontSize: 14, lineHeight: 22, color: colors.text, paddingLeft: spacing.sm },
    quote: { fontSize: 14, lineHeight: 22, color: colors.textMuted, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: spacing.md },
    mono: { fontFamily: "monospace", fontSize: 12, lineHeight: 18, color: colors.text },
    code: { color: colors.text },
    codeBlock: { backgroundColor: colors.neutralBg, borderRadius: 8, padding: spacing.md },
    bold: { fontWeight: "700" },
    italic: { fontStyle: "italic" },
    link: { color: colors.primary, textDecorationLine: "underline" },
    spacer: { height: spacing.sm },
    toolbar: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    action: { backgroundColor: colors.primaryMuted },
    actionText: { color: colors.primary, fontWeight: "600" },
  });
}
