import React, { useState, useMemo } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Keypair, TransactionBuilder, Networks, Asset, Operation } from "@stellar/stellar-sdk";
import { useTheme } from "../theme";
import { validateStellarSecret } from "../utils/validateStellarSecret";

export function DevSignerScreen() {
  const { colors, typography, shared, spacing } = useTheme();
  
  const [secretKey, setSecretKey] = useState("");
  const [signedXdr, setSignedXdr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [touched, setTouched] = useState(false);

  const validation = useMemo(() => validateStellarSecret(secretKey), [secretKey]);
  const fieldError = touched && secretKey.length > 0 && !validation.isValid ? validation.errorMessage : null;

  const handleSignTransaction = async () => {
    setError(null);
    setSignedXdr("");
    setIsSigning(true);

    try {
      // Small timeout to allow UI to update to loading state
      await new Promise((resolve) => setTimeout(resolve, 100));

      const keypair = Keypair.fromSecret(secretKey);
      
      // Dummy source account using testnet
      const sourceAccount = new (require("@stellar/stellar-sdk")).Account(keypair.publicKey(), "1");
      
      // Build a dummy transaction
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
      .addOperation(Operation.payment({
        destination: keypair.publicKey(),
        asset: Asset.native(),
        amount: "1.0",
      }))
      .setTimeout(30)
      .build();

      transaction.sign(keypair);
      setSignedXdr(transaction.toEnvelope().toXDR("base64"));
    } catch (err: any) {
      setError(err.message || "Failed to sign transaction. Ensure secret key is valid.");
    } finally {
      setIsSigning(false);
    }
  };

  const isButtonDisabled = !validation.isValid || isSigning;

  return (
    <ScrollView style={[shared.screen, { padding: spacing.lg }]} keyboardShouldPersistTaps="handled">
      <Text style={[typography.title, { marginBottom: spacing.md }]}>Dev Signer PoC</Text>
      
      <Text style={[typography.body, { marginBottom: spacing.lg }]}>
        This is a development-only screen to test local signing of transactions using @stellar/stellar-sdk.
        Do NOT use this in production.
      </Text>

      <Text style={[typography.cardTitle, { marginBottom: spacing.xs }]}>Secret Key</Text>
      <TextInput
        style={[
          styles.input,
          { 
            borderColor: colors.border, 
            backgroundColor: colors.surface,
            color: colors.text
          }
        ]}
        placeholder="S..."
        placeholderTextColor={colors.textSubtle}
        secureTextEntry
        value={secretKey}
        onChangeText={(text) => {
          setSecretKey(text);
          if (!touched) setTouched(true);
        }}
        onBlur={() => setTouched(true)}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {fieldError && (
        <Text style={{ color: colors.danger, fontSize: 13, marginTop: spacing.xs }}>
          {fieldError}
        </Text>
      )}

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
        <TouchableOpacity
          style={[
            shared.button,
            shared.primaryButton,
            { flex: 1, opacity: isButtonDisabled ? 0.6 : 1 }
          ]}
          disabled={isButtonDisabled}
          onPress={handleSignTransaction}
        >
          {isSigning ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={shared.primaryButtonText}>Sign Test Transaction</Text>
          )}
        </TouchableOpacity>

        {secretKey.length > 0 && (
          <TouchableOpacity
            style={[
              shared.button,
              { flex: 1, backgroundColor: colors.neutralBg, borderColor: colors.border, borderWidth: 1 }
            ]}
            onPress={() => {
              setSecretKey("");
              setTouched(false);
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "600" }}>Clear Key</Text>
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <View style={[styles.errorBox, { backgroundColor: colors.dangerBg, borderColor: colors.danger }]}>
          <Text style={{ color: colors.danger }}>{error}</Text>
        </View>
      )}

      {signedXdr ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[typography.cardTitle, { marginBottom: spacing.xs }]}>Signed XDR</Text>
          <View style={[styles.xdrBox, { backgroundColor: colors.neutralBg, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontFamily: "monospace" }}>{signedXdr}</Text>
          </View>
        </View>
      ) : null}
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  errorBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  xdrBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  }
});
