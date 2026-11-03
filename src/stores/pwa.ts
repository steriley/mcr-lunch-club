import { atom } from 'nanostores';

/** Chrome's deferred install prompt (`beforeinstallprompt`), kept until the visitor presses "Install app". */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const $installPrompt = atom<InstallPromptEvent | null>(null);

/** A new worker is installed and waiting: the page offers "New verdicts published · Refresh". */
export const $updateReady = atom<ServiceWorker | null>(null);

/**
 * The page came from the device's cache rather than the network. `builtAt` is when the site
 * behind it was built, for the "Offline · verdicts as of …" label.
 */
export const $savedCopy = atom<{ builtAt: string | null } | null>(null);
