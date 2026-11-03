/**
 * Decides when to offer "Install app". There is no prompt API on iOS, so Safari there gets a
 * "Share → Add to Home Screen" hint instead; Chrome-family browsers get the real prompt.
 * Neither shows once the app is installed (running standalone).
 */

export interface InstallEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `matchMedia('(display-mode: standalone)').matches` */
  displayModeStandalone: boolean;
  /** Safari's own `navigator.standalone`, set when launched from the Home Screen. */
  navigatorStandalone: boolean;
}

function isStandalone(env: InstallEnvironment): boolean {
  return env.displayModeStandalone || env.navigatorStandalone;
}

/** iPhone, iPad (which reports as a Mac with a touch screen) and iPod. */
function isIos(env: InstallEnvironment): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true;
  return env.platform === 'MacIntel' && env.maxTouchPoints > 1;
}

/** Safari itself: the other iOS browsers cannot add to the Home Screen (Chrome and Firefox name themselves). */
export function isIosSafari(env: InstallEnvironment): boolean {
  return (
    isIos(env) &&
    /Safari\//.test(env.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(env.userAgent)
  );
}

export type InstallOffer = 'prompt' | 'ios-hint' | null;

export function installOffer(env: InstallEnvironment, hasPrompt: boolean): InstallOffer {
  if (isStandalone(env)) return null;
  if (hasPrompt) return 'prompt';
  return isIosSafari(env) ? 'ios-hint' : null;
}
