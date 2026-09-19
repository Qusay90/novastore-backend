import assert from 'node:assert/strict';
import test from 'node:test';
import { unregisterConfiguredPushProvider } from '../src/notifications/pushProviderGuard.ts';

test('unconfigured native provider is never invoked or reported revoked', async () => {
  let calls = 0;
  await assert.rejects(unregisterConfiguredPushProvider(async () => ({ providerConfigured: false }), async () => { calls++; }), /ANDROID_PUSH_PROVIDER_NOT_CONFIGURED/);
  assert.equal(calls, 0);
});

test('configured provider retains original unregister behavior exactly once', async () => {
  let calls = 0;
  await unregisterConfiguredPushProvider(async () => ({ providerConfigured: true }), async () => { calls++; });
  assert.equal(calls, 1);
});

test('capability and provider failures propagate without claiming successful cleanup', async () => {
  let calls = 0;
  const failure = new Error('native capability unavailable');
  await assert.rejects(unregisterConfiguredPushProvider(async () => { throw failure; }, async () => { calls++; }), failure);
  assert.equal(calls, 0);
  await assert.rejects(unregisterConfiguredPushProvider(async () => ({ providerConfigured: true }), async () => { calls++; throw new Error('provider failed'); }), /provider failed/);
  assert.equal(calls, 1);
});
