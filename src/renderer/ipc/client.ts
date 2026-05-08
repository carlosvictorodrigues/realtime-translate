// The preload exposes window.rt — re-export with type for renderer use.
import type { RtApi } from '../../main/preload';

declare global {
  interface Window {
    rt: RtApi;
  }
}

export const rt: RtApi = window.rt;
