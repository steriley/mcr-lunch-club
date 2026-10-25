import type { Ref } from 'vue';
import { $isNearMeOpen } from '@/stores/filters';

const HASH = '#near-me';

/**
 * Keeps Near Me and the `#near-me` hash in step, so Back closes it and a
 * `#near-me` link (or Forward) opens it.
 */
export function useNearMeHistory(isOpen: Ref<boolean>) {
  let hasPushedHistory = false;
  let isInternalStateChange = false;

  function settleInternalChange() {
    isInternalStateChange = true;
    setTimeout(() => {
      isInternalStateChange = false;
    }, 50);
  }

  function onLocationChange() {
    if (isInternalStateChange) return;
    const isHashNearMe = window.location.hash === HASH;
    if (isHashNearMe && !isOpen.value) {
      $isNearMeOpen.set(true);
    } else if (!isHashNearMe && isOpen.value) {
      hasPushedHistory = false;
      $isNearMeOpen.set(false);
    }
  }

  /** On open: add a history entry, so Back closes Near Me. */
  function pushHash() {
    if (window.location.hash === HASH) return;
    settleInternalChange();
    history.pushState({ nearMe: true }, '', HASH);
    hasPushedHistory = true;
  }

  /** On close: undo our entry, or strip a hash the page was opened with. */
  function clearHash() {
    if (window.location.hash !== HASH) return;
    if (hasPushedHistory) {
      hasPushedHistory = false;
      settleInternalChange();
      history.back();
    } else {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function listen() {
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onLocationChange);
  }

  function unlisten() {
    window.removeEventListener('popstate', onLocationChange);
    window.removeEventListener('hashchange', onLocationChange);
  }

  return { pushHash, clearHash, listen, unlisten };
}
