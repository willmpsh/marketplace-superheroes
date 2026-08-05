import { createSign } from "crypto";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
const PRIVATE_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(
  /\\n/g,
  "\n",
);

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Self-signed JWT → OAuth access token, so we don't need the full googleapis SDK for a read-only sync job. */
async function getAccessToken(): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // Google rejects a JWT whose iat looks like it's in the future, and rejects
  // it if iat is too far in the past — back-date slightly to absorb minor
  // clock skew between the serverless host's clock and Google's, without
  // eating into the 1-hour exp window Google enforces from iat.
  const now = Math.floor(Date.now() / 1000) - 30;
  const claims = base64url(
    JSON.stringify({
      iss: SERVICE_ACCOUNT_EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = base64url(signer.sign(PRIVATE_KEY));

  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

/** Values are a raw grid (row-major, unqualified types) — no header parsing here, callers know their own sheet's layout. */
export async function fetchSheetValues(spreadsheetId: string, range: string) {
  const accessToken = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Sheets API failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return (json.values ?? []) as string[][];
}
