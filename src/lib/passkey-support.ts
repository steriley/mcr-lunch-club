/**
 * Whether this page may offer a passkey (#153). Passkeys are bound to one domain (the passkey host
 * from `getPasskeyEnvironment`), so on a Preview URL or any other host the button is hidden and
 * Chairs use their password. Browser-safe: no imports.
 */
export function canOfferPasskey(options: {
  pageHost: string;
  passkeyHost: string | null | undefined;
  hasWebAuthn: boolean;
}): boolean {
  if (!options.hasWebAuthn || !options.passkeyHost) return false;
  return options.pageHost.toLowerCase() === options.passkeyHost.toLowerCase();
}

/** True in a browser with the WebAuthn API. */
export function browserHasWebAuthn(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.get === 'function'
  );
}
