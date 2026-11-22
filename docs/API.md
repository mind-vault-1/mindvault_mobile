# Mobile API contract

## Contract rules

- Every mobile request documents method, authentication, request shape, response shape, error code, and relevant headers.
- Wallet signing secrets remain in the device wallet module and are never sent to the API.
- Payment requests exceeding the configured local spending guard require an additional user confirmation before dispatch.
- Localized UI strings use stable message keys; API error codes remain locale-neutral.

## Compatibility

New endpoints must be additive or provide a versioned migration path. Clients must treat unknown response fields as forward-compatible and surface stable error codes with a remediation message.

## Verification

Confirm endpoint examples against the server implementation before release, including authentication, pagination, x402, and HMAC headers where applicable.