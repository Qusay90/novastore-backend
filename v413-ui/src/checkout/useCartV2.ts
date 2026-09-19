import { useCallback, useEffect, useRef, useState } from 'react';
import { CustomerNotificationApiError, currentCustomerSessionGuard, customerSessionMatchesGuard, requestCustomerCartV2 } from '../notifications/customerNotificationApi';
import { cartV2MutationBody, normalizeCartV2, type CartV2State, type CartV2Identity } from './cartV2Contract';

export function useCartV2(accountId: number | null) {
  const account = useRef(accountId);
  account.current = accountId;
  const epoch = useRef(0);
  const serial = useRef(0);
  const lock = useRef(false);
  const current = useRef<{ owner: number; state: CartV2State } | null>(null);
  const [value, setValue] = useState<{ owner: number; state: CartV2State } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const owner = account.current;
    if (owner === null || lock.current) return;
    const generation = epoch.current;
    const request = ++serial.current;
    const guard = currentCustomerSessionGuard();
    const active = () => account.current === owner && epoch.current === generation && request === serial.current && customerSessionMatchesGuard(guard);
    setBusy(true);
    try {
      const response = await requestCustomerCartV2('/api/shared-state/cart', 'GET', undefined, guard);
      const state = normalizeCartV2(response.payload, response);
      if (!active()) return;
      if (current.current?.owner === owner && state.revision < current.current.state.revision) throw new Error('Sunucu eski sepet sürümü döndürdü.');
      current.current = { owner, state };
      setValue(current.current);
      setError('');
    } catch (failure) {
      if (active()) setError(failure instanceof Error ? failure.message : 'Sepet eşitlenemedi.');
    } finally { if (active()) setBusy(false); }
  }, []);

  useEffect(() => {
    ++epoch.current;
    ++serial.current;
    lock.current = false;
    current.current = null;
    setValue(null);
    setError('');
    setBusy(accountId !== null);
    if (accountId !== null) void reload();
    return () => { ++epoch.current; ++serial.current; };
  }, [accountId, reload]);

  const mutate = useCallback(async (method: 'PUT' | 'POST', body: Record<string, unknown>) => {
    const owner = account.current;
    if (owner === null || current.current?.owner !== owner || lock.current) throw new Error('Sepet eşitleniyor. Biraz sonra yeniden dene.');
    const generation = epoch.current;
    const request = ++serial.current;
    const guard = currentCustomerSessionGuard();
    const active = () => account.current === owner && epoch.current === generation && request === serial.current && customerSessionMatchesGuard(guard);
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await requestCustomerCartV2(`/api/shared-state/cart${method === 'POST' ? '/finalize' : ''}`, method, body, guard);
      const state = normalizeCartV2(response.payload, response);
      if (!active()) throw new Error('Sepet hesabı bu sırada değişti.');
      if (state.revision < current.current!.state.revision) throw new Error('Sunucu eski sepet sürümü döndürdü.');
      current.current = { owner, state };
      setValue(current.current);
      return state;
    } catch (failure) {
      if (active()) {
        lock.current = false;
        if (failure instanceof CustomerNotificationApiError && failure.status === 409) {
          await reload();
          if (account.current === owner && epoch.current === generation) setError('Sepetin başka bir cihazda değişti. Güncel sepet yüklendi; yapmak istediğin işlemi yeniden seç.');
        } else setError(failure instanceof Error ? failure.message : 'Sepet kaydedilemedi.');
      }
      throw failure;
    } finally {
      if (account.current === owner && epoch.current === generation) { lock.current = false; setBusy(false); }
    }
  }, [reload]);

  const replace = useCallback((items: readonly CartV2Identity[], resolved: readonly number[] = []) => {
    const state = current.current?.owner === account.current ? current.current?.state : null;
    if (!state) return Promise.reject(new Error('Sepeti önce sunucudan yenile.'));
    return mutate('PUT', cartV2MutationBody(state, items, resolved));
  }, [mutate]);
  const finalize = useCallback((orderId: number) => {
    const state = current.current?.owner === account.current ? current.current?.state : null;
    if (!state) return Promise.reject(new Error('Sepeti önce sunucudan yenile.'));
    return mutate('POST', { expectedRevision: state.revision, orderId });
  }, [mutate]);
  const state = value?.owner === accountId ? value.state : null;
  return { state, busy, error, reload, replace, finalize };
}
