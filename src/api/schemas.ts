import { z } from "zod";

/**
 * Verification status of a resource on MindVault.
 */
export const VerificationStatusSchema = z.enum(["verified", "pending", "rejected"]);
export type VerificationStatusFromSchema = z.infer<typeof VerificationStatusSchema>;

/**
 * On-chain status of a resource.
 */
export const OnchainStatusSchema = z.enum(["registered", "pending", "failed", "none"]);
export type OnchainStatusFromSchema = z.infer<typeof OnchainStatusSchema>;

/**
 * Schema for an individual resource.
 */
export const ResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.string(),
  resourceType: z.string(),
  publisherName: z.string().optional(),
  walletAddress: z.string(),
  verificationStatus: VerificationStatusSchema,
  onchainStatus: OnchainStatusSchema,
  onchainTxHash: z.string().optional(),
  listed: z.boolean(),
  accessUrl: z.string(),
  mimeType: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ResourceFromSchema = z.infer<typeof ResourceSchema>;

/**
 * Schema for the catalog envelope structure.
 */
export const CatalogEnvelopeSchema = z.object({
  items: z.array(ResourceSchema).default([]),
  total: z.number().optional(),
  nextOffset: z.number().nullable().optional(),
});
export type CatalogEnvelopeFromSchema = z.infer<typeof CatalogEnvelopeSchema>;

/**
 * Schema for GET /resources: either a bare array or an envelope with pagination.
 */
export const CatalogPageSchema = z.union([
  z.array(ResourceSchema),
  CatalogEnvelopeSchema,
]);
export type CatalogPageFromSchema = z.infer<typeof CatalogPageSchema>;

/**
 * Schema for Registry status response.
 */
export const RegistryStatusSchema = z.object({
  resourceCount: z.number(),
});
export type RegistryStatusFromSchema = z.infer<typeof RegistryStatusSchema>;

/**
 * Schema for prepared transactions returned by publisher prepare endpoints
 * (/register/prepare, /price/prepare, /ownership/prepare).
 */
export const PreparedTransactionSchema = z.object({
  unsignedXdr: z.string(),
  networkPassphrase: z.string().optional(),
});
export type PreparedTransactionFromSchema = z.infer<typeof PreparedTransactionSchema>;

/**
 * Schema for submit price edit responses.
 */
export const SubmitPriceEditResponseSchema = z.object({
  id: z.string(),
  price: z.string(),
  status: z.string(),
});
export type SubmitPriceEditResponseFromSchema = z.infer<typeof SubmitPriceEditResponseSchema>;

/**
 * Schema for submit registration responses.
 */
export const SubmitRegisterResponseSchema = z.object({
  txHash: z.string(),
});
export type SubmitRegisterResponseFromSchema = z.infer<typeof SubmitRegisterResponseSchema>;
