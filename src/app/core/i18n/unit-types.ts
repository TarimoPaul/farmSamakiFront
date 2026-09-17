import { Lang } from '../services/language';
import { UnitType } from '../models/production-unit';

/**
 * Display text for each unit type code.
 *
 * It lives in core, not next to a screen, because the dashboard and Production
 * both show unit types and a pond must read the same on each. The codes are
 * English and never shown; this is the only place their words live.
 */
const UNIT_TYPE_LABELS: Record<UnitType, Record<Lang, string>> = {
  TANK: { en: 'Tank', sw: 'Tangi' },
  POND_EARTHEN: { en: 'Earthen Pond', sw: 'Bwawa la kuchimbwa' },
  POND_LINED: { en: 'Lined Pond', sw: 'Bwawa la kujengwa' },
};

/**
 * The label for a unit type, in the given language.
 *
 * A code outside the list falls back to itself, like the screens' status
 * labels do: the database CHECK rules it out, and if it ever slipped through
 * the raw code is more useful to whoever reports it than a blank.
 */
export function unitTypeLabel(type: string, lang: Lang): string {
  return (UNIT_TYPE_LABELS as Record<string, Record<Lang, string>>)[type]?.[lang] ?? type;
}
