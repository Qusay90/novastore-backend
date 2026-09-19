/** Unconfigured native Firebase must never be invoked: its Java unregister
 * throws before a promise can reject. A failed capability check is not proof
 * of revocation; callers retain their existing server/provider revoke policy. */
export async function unregisterConfiguredPushProvider(
  capability: () => Promise<Readonly<{ providerConfigured: boolean }>>,
  unregister: () => Promise<void>,
): Promise<void> {
  if ((await capability()).providerConfigured !== true) {
    throw new Error('ANDROID_PUSH_PROVIDER_NOT_CONFIGURED');
  }
  await unregister();
}
