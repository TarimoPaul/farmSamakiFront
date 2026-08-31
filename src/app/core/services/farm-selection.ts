import { Injectable, signal } from '@angular/core';

const SELECTED_FARM_KEY = 'samakiFarm.selectedFarmId';

/**
 * The farm ROOT is currently working in.
 *
 * ROOT holds no membership, so it has no `farmId`, and every farm-scoped call
 * answers NO_FARM_CONTEXT until a farm is picked - which is why the system's
 * own administrator was the one account that could not open a dashboard. The
 * pick travels as the `X-Farm-Id` header on every request (see
 * authInterceptor) and the backend applies it for that request only: nothing
 * is written to the database and nothing is baked into the token, so clearing
 * it here genuinely undoes it.
 *
 * Persisted like the token, and for the same reason: a page refresh must not
 * silently drop ROOT back to "no farm" while the screen still shows a farm.
 *
 * It is a REQUEST, never the truth. What the backend actually applied comes
 * back as `farmId` on `GET /api/auth/me`, and that is what the switcher
 * displays - so a selection the backend refuses (a deleted farm, or any
 * caller that is not ROOT) cannot make the UI claim a farm that is not in
 * use.
 */
@Injectable({ providedIn: 'root' })
export class FarmSelectionService {
  readonly selectedFarmId = signal<number | null>(this.readStored());

  select(farmId: number | null): void {
    if (farmId === null) {
      localStorage.removeItem(SELECTED_FARM_KEY);
    } else {
      localStorage.setItem(SELECTED_FARM_KEY, String(farmId));
    }
    this.selectedFarmId.set(farmId);
  }

  /** Called on log out and on every new sign-in - a selection belongs to one session. */
  clear(): void {
    this.select(null);
  }

  private readStored(): number | null {
    const raw = localStorage.getItem(SELECTED_FARM_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      // Corrupt/legacy value: drop it rather than sending nonsense in a header.
      localStorage.removeItem(SELECTED_FARM_KEY);
      return null;
    }
    return parsed;
  }
}
