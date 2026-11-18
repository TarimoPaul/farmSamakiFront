import { Injectable, signal } from '@angular/core';

const SELECTED_CYCLE_KEY = 'samakiFarm.selectedCycleId';

/**
 * The cycle the user is currently working on.
 *
 * Every day-to-day log the app will grow - a water reading, a feeding, a
 * completed task - is about ONE cycle. The choice is made in ONE place and read
 * from here, so every screen agrees on it: picked on Production, or - since
 * 2026-09-19 - with the shared CyclePicker at the top of Feeding and Water
 * Quality, so a worker at the tank no longer goes to Production and back
 * first. Whichever screen picks, the others follow.
 *
 * Deliberately modelled on FarmSelectionService, including the persistence:
 * a page refresh in the middle of recording readings must not silently drop
 * the user back to "no cycle" while the screen still shows one.
 *
 * IT IS A REQUEST, NEVER THE TRUTH - the same rule the farm switcher follows.
 * A cycle belongs to a farm, so a stored id can outlive its farm: ROOT
 * switches farm, the cycle is deleted, or the browser has last week's value.
 * Screens therefore resolve this id against the cycles the backend returned
 * for the ACTIVE farm and treat "not in that list" as nothing selected (see
 * Production.syncSelection). Without that rule a stale id would be sent as
 * `cycleId` into a farm it does not belong to - which the backend refuses,
 * but the screen would have had no idea why.
 */
@Injectable({ providedIn: 'root' })
export class CycleSelectionService {
  readonly selectedCycleId = signal<number | null>(this.readStored());

  select(cycleId: number | null): void {
    if (cycleId === null) {
      localStorage.removeItem(SELECTED_CYCLE_KEY);
    } else {
      localStorage.setItem(SELECTED_CYCLE_KEY, String(cycleId));
    }
    this.selectedCycleId.set(cycleId);
  }

  /** Called on log out and on every new sign-in - a selection belongs to one session. */
  clear(): void {
    this.select(null);
  }

  private readStored(): number | null {
    const raw = localStorage.getItem(SELECTED_CYCLE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      // Corrupt/legacy value: drop it rather than sending nonsense to the API.
      localStorage.removeItem(SELECTED_CYCLE_KEY);
      return null;
    }
    return parsed;
  }
}
