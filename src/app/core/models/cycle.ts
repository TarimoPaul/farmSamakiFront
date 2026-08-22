export interface Cycle {
  cycleId: string;
  unit: { unitId: string; code: string; type: string };
  speciesName: string;
  stockingDate: string;
  fingerlingsCount: number;
  survivalRateEstimate: number;
  expectedHarvestDate: string | null;
  actualHarvestDate: string | null;
  status: string;
}
