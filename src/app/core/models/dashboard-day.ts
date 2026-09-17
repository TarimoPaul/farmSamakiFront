import { Cycle } from './cycle';

/**
 * Hali ya shamba TAREHE MOJA - jibu la `dashboardOnDate`.
 *
 * Hakuna jedwali la historia nyuma yake: backend inakokotoa kila namba kutoka
 * kwa `created_at`/`deleted_at` za vitengo na uanachama, na
 * `stocking_date`/`actual_harvest_date` za mizunguko. Ndiyo maana inajibu kwa
 * tarehe za NYUMA pia.
 */
export interface DashboardDay {
  /** Tarehe iliyoulizwa (YYYY-MM-DD), ikirudishwa ili UI ihakiki. */
  date: string;

  unitsExisting: number;
  unitsActive: number;
  unitsIdle: number;
  totalVolumeM3: number;

  cyclesRunning: number;

  /**
   * Mizunguko iliyokuwa inaendelea siku hiyo - safu za jedwali la dashibodi.
   *
   * `cyclesRunning` NI urefu wa orodha hii (backend inaihesabu hivyo), hivyo
   * tile na jedwali haviwezi kutofautiana. `status` ni hali ya SASA: mzunguko
   * uliovunwa baadaye unarudi HARVESTED, ingawa siku hiyo ulikuwa unaendelea.
   */
  cycles: Cycle[];

  cyclesStarted: number;
  cyclesClosed: number;

  /** Vifaranga walio ndani ya mizunguko iliyokuwa inaendelea - HIFADHI. */
  fingerlingsRunning: number;

  /**
   * Vifaranga walioingizwa SIKU hiyo - MTIRIRIKO.
   *
   * Si kitu kimoja na `fingerlingsRunning`, na tile ya dashibodi inasoma ile
   * ya kwanza. Kuzibadilisha kungeacha lebo ileile juu ya namba yenye maana
   * tofauti kabisa.
   */
  fingerlingsStocked: number;

  members: number;

  /**
   * Vitengo kwa aina, siku hiyo.
   *
   * Aina isiyo na kitengo siku hiyo HAIPO kwenye orodha - mteja anajaza sifuri
   * kutoka kwa orodha yake ya aina, ili kadi isibadilike umbo kulingana na
   * data iliyopo.
   */
  unitsByType: { type: string; count: number }[];

  /** Tarehe ya kwanza tuliyo na rekodi yake kwa shamba hili. */
  historyStartsOn: string | null;

  /**
   * false = tarehe iliyoulizwa iko KABLA ya rekodi yetu ya kwanza.
   *
   * Namba zote hapo juu ni sifuri, na sifuri hiyo ina maana ya "hatujui", si
   * "hapakuwa na kitu". UI LAZIMA itofautishe hizo mbili - angalia Dashboard.
   */
  historyComplete: boolean;
}
