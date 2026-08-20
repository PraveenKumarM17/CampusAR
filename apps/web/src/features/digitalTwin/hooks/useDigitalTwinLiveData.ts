import { useCampusLive } from '../../../hooks/useCampusLive';

/** Reuses the existing campus WebSocket hook — does not open a second protocol. */
export function useDigitalTwinLiveData() {
  return useCampusLive();
}
