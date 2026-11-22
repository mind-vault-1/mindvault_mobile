import * as Clipboard from "expo-clipboard";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "../theme/ThemeProvider";
import { logError, normalizeError, type NormalizedError } from "../utils/errorLogger";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: NormalizedError | null;
  resetKey: number;
}

function ErrorFallback({ error, onRetry }: { error: NormalizedError; onRetry: () => void }) {
  const { colors, shared, typography } = useAppTheme();
  const details = [error.message, error.stack].filter(Boolean).join("\n\n");

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={typography.heading}>Something went wrong</Text>
        <Text style={typography.body}>
          MindVault hit an unexpected error. You can retry or copy safe details for support.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={[shared.button, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>Try again</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void Clipboard.setStringAsync(details)}
          style={shared.button}
        >
          <Text style={shared.buttonText}>Copy error details</Text>
        </Pressable>
      </View>
    </View>
  );
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown) {
    const normalized = logError("app.render", error);
    this.setState({ error: normalized });
  }

  retry = () => {
    this.setState(({ resetKey }) => ({ error: null, resetKey: resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onRetry={this.retry} />;
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
});
