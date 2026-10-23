import { Buffer } from "buffer";

import { ApiError } from "./client";
import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  encodePaymentSignature,
  parsePaymentRequired,
  type PaymentChallenge,
} from "./payment";
import { publisherFetch } from "./resources";
import type { Resource } from "../types";

export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 2000;
const USDC_DECIMALS = 7;

/** What the publisher fills in on the Publish screen. */
export interface PublishLinkInput {
  title: string;
  url: string;
  price: string;
  description: string;
}

export type PublishLinkErrors = Partial<Record<keyof PublishLinkInput, string>>;

/** Returns one message per invalid field; an empty object means the form is valid. */
export function validatePublishLink(input: PublishLinkInput): PublishLinkErrors {
  const errors: PublishLinkErrors = {};

  const title = input.title.trim();
  if (!title) errors.title = "Title is required.";
  else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  }

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

/** Converts USDC base units ("15000000") to a display amount ("1.5"). */
export function atomicToDisplay(amount: string): string {
  const padded = amount.padStart(USDC_DECIMALS + 1, "0");
  const whole = padded.slice(0, -USDC_DECIMALS);
  const fraction = padded.slice(-USDC_DECIMALS).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
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
 * the challenge and signed transaction to pay and publish.
 */
export async function publishLink(
  input: PublishLinkInput,
  payment?: { challenge: PaymentChallenge; transaction: string }
): Promise<PublishResult> {
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
        ...(payment
          ? {
              headers: {
                [PAYMENT_SIGNATURE_HEADER]: encodePaymentSignature(
                  payment.challenge,
                  payment.transaction
                ),
              },
            }
          : {}),
      },
      "Failed to publish resource"
    );
    return { type: "published", resource };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 402) throw error;
    if (payment) {
      throw new Error("The verification fee was not accepted. Check your USDC balance and try again.");
    }
    return { type: "payment", ...readVerificationFee(error.headers?.get(PAYMENT_REQUIRED_HEADER) ?? null) };
  }
}
