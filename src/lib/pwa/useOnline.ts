import { useStore } from '@nanostores/vue';
import { $online, startOnlineTracking } from '@/stores/online';

/** A ref that follows the connection. Anything that needs the network shows a disabled state while it is false. */
export function useOnline() {
  startOnlineTracking();
  return useStore($online);
}
