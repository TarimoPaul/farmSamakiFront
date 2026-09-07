import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlService } from './graphql';
import { CreateSpeciesArgs, Species } from '../models/species';

/**
 * The species catalogue - reading it, and adding to it.
 *
 * SEPARATE FROM ProductionService, which also reads `species`, and
 * deliberately so: Production asks for the catalogue as one field of a larger
 * context query (units + cycles + species in one round trip, because the
 * cycle form needs all three before it can render). This service asks for the
 * catalogue ALONE, which is what a screen managing it wants - and it is the
 * only place `createSpecies` is sent from.
 *
 * NOT FARM-SCOPED. `species` has no farm column, so the X-Farm-Id header the
 * interceptor adds is simply irrelevant to both calls here.
 */
@Injectable({ providedIn: 'root' })
export class SpeciesService {
  private readonly graphql = inject(GraphqlService);

  /**
   * The whole catalogue. `view_dashboard` on the backend, not
   * `manage_species`: everyone who picks a species while starting a cycle
   * reads this.
   */
  list(): Observable<Species[]> {
    return this.graphql.query<{ species: Species[] }>(SPECIES).pipe(map((data) => data.species));
  }

  /**
   * Adds a species to the catalogue.
   *
   * THREE VARIABLES, not one input object - see CreateSpeciesArgs.
   *
   * The backend refuses three things. A duplicate name is CONFLICT, raised by
   * `SpeciesService.requireAvailableName` and counting soft-deleted rows, so a
   * name that was used and removed is still taken. A number at or below zero,
   * a number too small to survive its column's scale, and a number over the
   * column's ceiling are all VALIDATION_ERROR, each in a sentence that names
   * the field and the limit - which is why the screen shows those verbatim
   * rather than replacing them with a line of its own.
   */
  create(args: CreateSpeciesArgs): Observable<Species> {
    return this.graphql
      .query<{ createSpecies: Species }>(CREATE_SPECIES, {
        name: args.name,
        growthMonthsAvg: args.growthMonthsAvg,
        avgHarvestWeightKg: args.avgHarvestWeightKg,
      })
      .pipe(map((data) => data.createSpecies));
  }
}

const SPECIES_FIELDS = `
  speciesId
  name
  growthMonthsAvg
  avgHarvestWeightKg
`;

const SPECIES = `
  query Species {
    species { ${SPECIES_FIELDS} }
  }
`;

// FLAT ARGUMENTS, and both numbers are `Float!` - `growthMonthsAvg` is not an
// Int, which is the whole reason half-months survive the round trip.
const CREATE_SPECIES = `
  mutation CreateSpecies($name: String!, $growthMonthsAvg: Float!, $avgHarvestWeightKg: Float!) {
    createSpecies(
      name: $name
      growthMonthsAvg: $growthMonthsAvg
      avgHarvestWeightKg: $avgHarvestWeightKg
    ) { ${SPECIES_FIELDS} }
  }
`;
