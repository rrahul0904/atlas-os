# Google Workspace Integration

AtlasOS integrates Google Workspace through the canonical IntegrationAdapter and durable Agent Governance path.

## Supported v1 capabilities

Gmail:
- search messages
- read message metadata/snippet
- send governed messages

Calendar:
- list events
- create governed events
- update governed events

OAuth scopes are intentionally limited to:
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/calendar.events`

No Drive, Docs, Sheets, Contacts, or broad Calendar administration scopes are requested by this implementation.

## Required server configuration

Production Google connection requires:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
ATLAS_SECRET_ENCRYPTION_KEY
```

For key rotation, AtlasOS can instead use:

```text
ATLAS_SECRET_KEY_VERSION=2
ATLAS_SECRET_ENCRYPTION_KEYS={"1":"<base64-or-hex-key>","2":"<base64-or-hex-key>"}
```

Every encryption key must decode to exactly 32 bytes.

Do not commit any of these secret values to Git.

The OAuth redirect URI must be HTTPS in production and must exactly match an authorized redirect URI configured for the Google OAuth client.

Suggested route:

```text
https://<production-domain>/app/integrations/google/callback
```

## OAuth security

AtlasOS uses:
- cryptographically random OAuth state;
- server-side state hash persisted in PostgreSQL;
- tenant/workspace/user binding;
- one-time transaction consumption;
- ten-minute transaction expiry;
- PKCE S256;
- encrypted PKCE verifier storage;
- server-side authorization-code exchange;
- encrypted token storage.

The browser never receives access or refresh tokens.

## Token storage

`atlas_integration_connections` stores only:
- external account reference;
- safe scope metadata;
- `pgsecret:<uuid>` reference;
- integration health.

`atlas_secret_values` stores authenticated ciphertext, IV, auth tag, algorithm and key version.

Authenticated encryption binds the secret to:
- tenant;
- workspace;
- secret record identifier.

## Refresh and reauthentication

Access tokens are refreshed centrally before expiry.

If Google returns `invalid_grant`, AtlasOS marks the connection:

`needs_reauthentication`

The operator then reconnects from `/app/integrations`.

## Provider replay safety

### Gmail

AtlasOS generates a stable RFC822 `Message-ID` from the durable workflow idempotency key.

On an ambiguous retry it searches Gmail for that message ID before sending again.

### Calendar

Calendar create uses a stable caller-supplied event ID derived from the Atlas idempotency key.

Calendar update stores a private Atlas action marker in the event and reconciles that marker before replay.

The `atlas_integration_actions` ledger records durable provider intent and provider IDs.

## Human approval

Gmail send, Calendar create and Calendar update are high-risk write capabilities.

They cannot be downgraded by a workflow definition: IntegrationToolExecutor verifies provider write/risk metadata against the governed ToolDefinition.

## External production gates

Code/CI certification does not prove a real Google account is connected.

Before production launch:
1. enable Gmail API and Calendar API in the Google Cloud project;
2. configure OAuth consent;
3. configure the production redirect URI;
4. provide protected environment credentials;
5. complete Google app verification where required by the requested scopes and audience;
6. run a real non-destructive OAuth/Gmail/Calendar smoke test.

Until that smoke test succeeds, report:

`Provider contract certified; real Google credential smoke pending.`
