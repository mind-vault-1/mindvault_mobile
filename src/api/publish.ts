import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";

import { ApiError } from "./client";
import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  encodePaymentSignature,
  parsePaymentRequired,
  type PaymentChallenge,
} from "./payment";
import { getApiBaseUrl, publisherFetch } from "./resources";
import { notifyPublishResult, requestPublishNotificationsPermission } from "../services/notifications";
import { getApiKey } from "../services/secureStorage";
import type { Resource } from "../types";
import { extractApiErrorMessageFromBody } from "../utils/errorLogger";
import { getRequestPath, hashMultipartBody, signPublisherRequest } from "../utils/requestSignature";

export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 2000;
const USDC_DECIMALS = 7;
const STILL_PROCESSING_MESSAGE =
  "Your publish request is still processing. Please wait a moment before retrying.";

/** What the publisher fills in on the Publish screen. */
export interface PublishLinkInput {
  title: string;
  url: string;
  price: string;
  description: string;
}

export type PublishLinkErrors = Partial<Record<keyof PublishLinkInput, string>>;

/** Title, price and description rules, shared by link and file publishing. */
function validateDetails(input: Pick<PublishLinkInput, "title" | "price" | "description">) {
  const errors: PublishLinkErrors = {};

  const title = input.title.trim();
  if (!title) errors.title = "Title is required.";
  else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  }

  const price = input.price.trim();
  if (!price) errors.price = "Price is required.";
  else if (!/^\d+(\.\d{1,7})?$/.test(price)) {
    errors.price = "Price must be a number with up to 7 decimals.";
  } else if (Number(price) <= 0) errors.price = "Price must be greater than zero.";

  if (input.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
}

/** Returns one message per invalid field; an empty object means the form is valid. */
export function validatePublishLink(input: PublishLinkInput): PublishLinkErrors {
  const errors = validateDetails(input);

  const url = input.url.trim();
  if (!url) {
    errors.url = "URL is required.";
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        errors.url = "URL must start with http:// or https://.";
      }
    } catch {
      errors.url = "Enter a complete URL, including https://.";
    }
  }

  return errors;
}

/** Converts USDC base units ("15000000") to a display amount ("1.5"). */
export function atomicToDisplay(amount: string): string {
  const padded = amount.padStart(USDC_DECIMALS + 1, "0");
  const whole = padded.slice(0, -USDC_DECIMALS);
  const fraction = padded.slice(-USDC_DECIMALS).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Generates a scoped idempotency key for publishing a link resource. */
export function buildPublishIdempotencyKey(input: PublishLinkInput): string {
  return [
    "publish",
    input.title.trim(),
    input.url.trim(),
    input.price.trim(),
    input.description.trim(),
  ].join("|");
}

export type PublishResult =
  | { type: "published"; resource: Resource }
  | { type: "payment"; challenge: PaymentChallenge; fee: string };

/** Reads the fee the server asks for, then validates the challenge against it. */
function readVerificationFee(header: string | null): { challenge: PaymentChallenge; fee: string } {
  let fee = "0";
  try {
    const decoded = JSON.parse(Buffer.from(header ?? "", "base64").toString("utf8")) as {
      accepts?: { scheme?: string; amount?: string }[];
    };
    const amount = decoded.accepts?.find((option) => option?.scheme === "exact")?.amount;
    if (amount && /^\d+$/.test(amount)) fee = atomicToDisplay(amount);
  } catch {
    // parsePaymentRequired below reports the unreadable header.
  }
  return { challenge: parsePaymentRequired(header, fee), fee };
}

/**
 * Publishes a link resource with `POST /resources`.
 *
 * The server may charge a verification fee with an x402 `402`; that comes back
 * as `{ type: "payment" }` so the user can review and sign it. Call again with
 * the challenge and signed transaction to pay and publish. `idempotencyKey`
 * is forwarded as an `Idempotency-Key` header so a replayed (offline-queued)
 * publish cannot create the resource twice.
 */
export async function publishLink(
  input: PublishLinkInput,
  payment?: { challenge: PaymentChallenge; transaction: string },
  idempotencyKey?: string
): Promise<PublishResult> {
  const key = idempotencyKey ?? buildPublishIdempotencyKey(input);
  const body = {
    resourceType: "link",
    title: input.title.trim(),
    url: input.url.trim(),
    price: input.price.trim(),
    ...(input.description.trim() ? { description: input.description.trim() } : {}),
  };

  try {
    const resource = await publisherFetch<Resource>(
      "/resources",
      {
        method: "POST",
        body,
        headers: {
          ...(key ? { "Idempotency-Key": key } : {}),
          ...(payment
            ? {
                [PAYMENT_SIGNATURE_HEADER]: encodePaymentSignature(
                  payment.challenge,
                  payment.transaction
                ),
              }
            : {}),
        },
      },
      "Failed to publish resource",
      [402, 409]
    );
    return { type: "published", resource };
  } catch (error) {
    if (error instanceof ApiError && error.status === 402) {
      if (payment) {
        throw new Error("The verification fee was not accepted. Check your USDC balance and try again.");
      }
      return { type: "payment", ...readVerificationFee(error.headers?.get(PAYMENT_REQUIRED_HEADER) ?? null) };
    }
    if (error instanceof ApiError && error.status === 409) {
      throw new Error(STILL_PROCESSING_MESSAGE);
    }
    throw error;
  }
}

/** A file chosen on the device, as returned by the document picker. */
export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface PublishFileInput {
  title: string;
  price: string;
  description: string;
  file: PickedFile;
}

/** Largest file the server accepts, mirroring its multipart guard. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** MIME types the server accepts for file resources. */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
];

export type PublishFileErrors = PublishLinkErrors & { file?: string };

/** Size and type are checked here so a rejected file never leaves the device. */
export function validatePublishFile(input: PublishFileInput): PublishFileErrors {
  const errors: PublishFileErrors = validateDetails(input);
  const file = input.file;

  if (file.size <= 0) {
    errors.file = "That file is empty.";
  } else if (file.size > MAX_UPLOAD_BYTES) {
    errors.file = `File must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`;
  } else if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimeType.toLowerCase())) {
    errors.file = "Unsupported file type. Choose a PDF, an image or a text file.";
  }

  return errors;
}

export interface PublishFileOptions {
  payment?: { challenge: PaymentChallenge; transaction: string };
  idempotencyKey?: string;
  /** Called with a 0–1 fraction while the multipart body is uploading. */
  onProgress?: (progress: number) => void;
  /** Aborting the signal stops the upload; it then rejects with "Upload cancelled.". */
  signal?: AbortSignal;
}

/**
 * Publishes a file resource as a multipart `POST /resources`.
 *
 * The HMAC covers the canonical multipart body (`hashMultipartBody`), which
 * includes the file digest, so the bytes are read once here to sign the
 * request. `onProgress` reports upload progress and `signal` cancels it.
 */
export async function publishFile(
  input: PublishFileInput,
  options: PublishFileOptions = {}
): Promise<PublishResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("No API key configured");

  const fields: Record<string, string> = {
    resourceType: "file",
    title: input.title.trim(),
    price: input.price.trim(),
    ...(input.description.trim() ? { description: input.description.trim() } : {}),
  };

  const fileBytes = Buffer.from(
    await FileSystem.readAsStringAsync(input.file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    }),
    "base64"
  );
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "X-Timestamp": timestamp,
    "X-Signature": signPublisherRequest({
      secret: apiKey,
      method: "POST",
      path: getRequestPath("/resources"),
      timestamp,
      bodyHash: hashMultipartBody(fields, { bytes: fileBytes }),
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    }),
    ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    ...(options.payment
      ? {
          [PAYMENT_SIGNATURE_HEADER]: encodePaymentSignature(
            options.payment.challenge,
            options.payment.transaction
          ),
        }
      : {}),
  };

  const task = FileSystem.createUploadTask(
    `${getApiBaseUrl()}/resources`,
    input.file.uri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType: input.file.mimeType,
      parameters: fields,
      headers,
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (totalBytesExpectedToSend > 0) {
        options.onProgress?.(totalBytesSent / totalBytesExpectedToSend);
      }
    }
  );

  const cancel = () => void task.cancelAsync();
  options.signal?.addEventListener("abort", cancel);

  let upload: FileSystem.FileSystemUploadResult | null | undefined;
  try {
    upload = await task.uploadAsync();
  } catch (error) {
    throw options.signal?.aborted ? new Error("Upload cancelled.") : error;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
  }
  if (!upload) throw new Error("Upload cancelled.");

  return readPublishResponse(upload.status, upload.body, upload.headers, options.payment);
}

/** Maps a `POST /resources` response onto a publish result, or throws. */
function readPublishResponse(
  status: number,
  body: string,
  headers: Record<string, string> | null,
  payment?: { challenge: PaymentChallenge; transaction: string }
): PublishResult {
  if (status >= 200 && status < 300) {
    try {
      return { type: "published", resource: JSON.parse(body) as Resource };
    } catch {
      throw new Error("Failed to publish resource");
    }
  }

  if (status === 402) {
    if (payment) {
      throw new Error("The verification fee was not accepted. Check your USDC balance and try again.");
    }
    const challengeHeader =
      Object.entries(headers ?? {}).find(
        ([name]) => name.toLowerCase() === PAYMENT_REQUIRED_HEADER.toLowerCase()
      )?.[1] ?? null;
    return { type: "payment", ...readVerificationFee(challengeHeader) };
  }

  if (status === 409) throw new Error(STILL_PROCESSING_MESSAGE);

  throw new Error(
    extractApiErrorMessageFromBody(
      body,
      status === 403 ? "Forbidden: Access denied" : "Failed to publish resource"
    )
  );
}

export type PublishTimelineStatus = "submitted" | "verifying" | "verified" | "rejected" | "on-chain";

export interface PublishStatus {
  status: PublishTimelineStatus;
  verified?: boolean;
  txHash?: string;
  error?: string;
}

/** Fetches verification and on-chain sync status for a newly published resource. */
export async function fetchPublishStatus(resourceId: string): Promise<PublishStatus> {
  try {
    const resource = await publisherFetch<Resource>(
      `/resources/${encodeURIComponent(resourceId)}`,
      { method: "GET" },
      "Failed to check resource publish status"
    );

    if (resource.onchainStatus === "registered" || resource.onchainTxHash) {
      return { status: "on-chain", verified: true, txHash: resource.onchainTxHash };
    }
    if (resource.verificationStatus === "rejected" || resource.onchainStatus === "failed") {
      return { status: "rejected", verified: false, error: "Verification or sync rejected" };
    }
    if (resource.verificationStatus === "verified") {
      return { status: "verified", verified: true };
    }
    if (resource.verificationStatus === "pending" || resource.onchainStatus === "pending") {
      return { status: "verifying" };
    }
    return { status: "submitted" };
  } catch {
    return { status: "submitted" };
  }
}

/**
 * Polls the publish status of a resource with exponential backoff until a terminal state
 * ("on-chain" or "rejected") is reached, or until cancelled.
 */
export async function pollPublishStatus(
  resourceId: string,
  onStatus: (status: PublishStatus) => void,
  isCancelled: () => boolean,
  baseDelayMs = 1000,
  maxDelayMs = 10000
): Promise<void> {
  let delay = baseDelayMs;

  void requestPublishNotificationsPermission().catch(() => undefined);

  while (!isCancelled()) {
    const current = await fetchPublishStatus(resourceId);
    if (isCancelled()) break;
    onStatus(current);

    if (current.status === "on-chain" || current.status === "rejected") {
      void notifyPublishResult(resourceId, current.status).catch(() => undefined);
      break;
    }
    if (isCancelled()) break;

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, maxDelayMs);
  }
}
