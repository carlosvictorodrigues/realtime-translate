import type { DeviceInventory } from '../../../../shared/types';

/**
 * Returns true iff both VB-CABLE A and CABLE-B are detected with both their
 * playback (input) and recording (output) sides. The wizard's Step 3 gates
 * progression on this; the review screen uses it to show the cables section
 * as ok/warn. The full 4-clause check ensures we don't show a green status
 * when only one cable is partially detected.
 */
export function bothCablesPresent(inv: DeviceInventory): boolean {
  return Boolean(
    inv.cableA?.playback && inv.cableA?.recording &&
    inv.cableB?.playback && inv.cableB?.recording,
  );
}
