export interface ProductionUnit {
  unitId: string;
  code: string;
  type: string;
  sizeM3: number | null;
  waterSource: string | null;
  status: string;
}
