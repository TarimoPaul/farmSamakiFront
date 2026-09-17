import { UNIT_TYPES } from '../models/production-unit';
import { unitTypeLabel } from './unit-types';

describe('unitTypeLabel', () => {
  it('has words in both languages for every unit type', () => {
    for (const type of UNIT_TYPES) {
      expect(unitTypeLabel(type, 'en')).not.toBe(type);
      expect(unitTypeLabel(type, 'sw')).not.toBe(type);
    }
  });

  it('names the three types', () => {
    expect(UNIT_TYPES.map((type) => unitTypeLabel(type, 'en'))).toEqual([
      'Tank',
      'Earthen Pond',
      'Lined Pond',
    ]);
    expect(UNIT_TYPES.map((type) => unitTypeLabel(type, 'sw'))).toEqual([
      'Tangi',
      'Bwawa la kuchimbwa',
      'Bwawa la kujengwa',
    ]);
  });

  it('falls back to the code for a type it does not know', () => {
    expect(unitTypeLabel('CAGE', 'en')).toBe('CAGE');
  });
});
