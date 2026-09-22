export const hasUnsavedStudioWork = state => Boolean(state?.host && (Object.values(state.host.dirty || {}).some(Boolean) || Object.values(state.host.pending || {}).some(Boolean)));

export function createStudioLeaveGuard({readState,confirm,notify=()=>{}}) {
  return () => {
    let state;
    try { state=readState(); } catch { notify('Çalışma alanının kayıt durumu okunamadı. Sayfadan çıkmadan önce taslağı kontrol edin.');return false; }
    if (Object.values(state?.host?.pending || {}).some(Boolean)) {
      notify('Sunucudaki işlem sürüyor. Kayıt tamamlandıktan sonra tekrar deneyin.');return false;
    }
    if (!hasUnsavedStudioWork(state)) return true;
    return confirm('Studio’da kaydedilmemiş değişiklikler var. Bu alandan çıkarsanız bu değişiklikler kaybolacak. Kaydetmeden çıkmak istiyor musunuz?')===true;
  };
}
