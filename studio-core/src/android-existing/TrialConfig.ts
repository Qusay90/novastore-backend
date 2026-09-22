import { useSandbox } from '../sandbox/useSandbox.js';
import { isBlockActive } from '../sandbox/store.js';

export function useAndroidTrialDocument() {
  const draft = new URLSearchParams(window.location.search).get('preview') === 'draft';
  return useSandbox('android', draft);
}

export { isBlockActive };
