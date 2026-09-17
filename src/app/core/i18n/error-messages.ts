import { Lang } from '../services/language';
import { ApiError } from '../models/api-error';
import { ERROR_CODE } from '../models/error-codes';

/**
 * One line of user-facing copy per shared `errorCode`.
 *
 * It lives in core, not next to a screen, because the codes are the contract
 * for the WHOLE app: the same FORBIDDEN can come out of a dashboard query, a
 * unit form or a feeding log, and it should read the same every time.
 *
 * The backend's own message is Swahili regardless of UI language, so a known
 * code is always answered from here. Where the backend is more specific than
 * anything generic we could write - which field failed validation, which code
 * was a duplicate - the caller can still show `error.message` itself; see
 * apiErrorMessage below.
 */
const ERROR_CODE_MESSAGES: Record<string, Record<Lang, string>> = {
  [ERROR_CODE.FORBIDDEN]: {
    sw: 'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
    en: 'You do not have permission to view this. Ask your farm administrator.',
  },
  [ERROR_CODE.NO_FARM_CONTEXT]: {
    sw: 'Akaunti yako haijawekwa kwenye shamba lolote bado.',
    en: 'Your account is not assigned to a farm yet.',
  },
  [ERROR_CODE.UNAUTHENTICATED]: {
    sw: 'Kikao chako kimeisha. Ingia tena.',
    en: 'Your session has ended. Please sign in again.',
  },
  [ERROR_CODE.ACCOUNT_DISABLED]: {
    sw: 'Akaunti yako imezuiwa. Wasiliana na msimamizi.',
    en: 'Your account has been disabled. Contact your administrator.',
  },
  [ERROR_CODE.MUST_CHANGE_PASSWORD]: {
    sw: 'Lazima ubadilishe password kabla ya kuendelea.',
    en: 'You must change your password before continuing.',
  },
  [ERROR_CODE.CONFLICT]: {
    sw: 'Taarifa hizi zinagongana na zilizopo tayari.',
    en: 'This clashes with data that already exists.',
  },
  // The Swahili line is deliberately the backend's own sentence, word for
  // word: it is the wording the admins already know from the API, and there
  // is nothing to improve on it. The English is the whole point of mapping
  // this code at all - without it, an English UI showed Swahili prose.
  [ERROR_CODE.OWNER_IMMUTABLE]: {
    sw: 'Mmiliki wa shamba hawezi kutolewa kwenye shamba lake.',
    en: 'The farm owner cannot be removed from their own farm.',
  },
  // The Swahili is the backend's own wording, minus the dates it interpolates
  // - a screen that has just re-read the cycle is showing those anyway. The
  // English exists because the backend has none: without it, closing a cycle
  // twice answered an English UI in Swahili.
  [ERROR_CODE.CYCLE_ALREADY_CLOSED]: {
    sw: 'Mzunguko huu tayari umefungwa. Hauwezi kufungwa tena.',
    en: 'This cycle has already been closed. It cannot be closed again.',
  },
  [ERROR_CODE.VALIDATION_ERROR]: {
    sw: 'Taarifa ulizojaza hazikubaliki.',
    en: 'The details you entered were not accepted.',
  },
  [ERROR_CODE.TOO_MANY_REQUESTS]: {
    sw: 'Maombi mengi mno. Subiri kidogo kisha ujaribu tena.',
    en: 'Too many requests. Wait a moment and try again.',
  },
};

/** Shown when there is no code at all: a dead connection or an unmapped failure. */
const FALLBACK_MESSAGE: Record<Lang, string> = {
  sw: 'Imeshindikana kupata data. Angalia mtandao kisha ujaribu tena.',
  en: 'Could not load data. Check your connection and try again.',
};

/**
 * The message for a failure, in the UI language.
 *
 * `preferBackendMessage` is for forms: on VALIDATION_ERROR and CONFLICT the
 * backend names the actual problem ("Aina ya kitengo si sahihi. Chagua: TANK,
 * POND_EARTHEN, POND_LINED.") and that beats our generic line - at the cost of
 * being Swahili even in English UI. Read-only screens leave it off.
 */
export function apiErrorMessage(error: ApiError, lang: Lang, preferBackendMessage = false): string {
  if (preferBackendMessage && error.errorCode && error.message) {
    return error.message;
  }

  const mapped = error.errorCode ? ERROR_CODE_MESSAGES[error.errorCode] : undefined;
  return mapped ? mapped[lang] : FALLBACK_MESSAGE[lang];
}

/**
 * The two ways `closeCycle` is refused that have NO code of their own.
 *
 * Both arrive as a plain VALIDATION_ERROR, so there is nothing in
 * `extensions` to tell them apart - and this file's whole rule is that we
 * branch on codes, never on prose. So the CALLER names the rule: the close
 * form knows the stocking date it is closing against and the outcome it is
 * sending, which is everything needed to say which rule was broken without
 * reading a single word of the backend's sentence.
 *
 * They live here rather than in the screen's own copy because they are the
 * English half of a backend message that is always Swahili - the same job
 * ERROR_CODE_MESSAGES does, for a failure that happens to be identified by a
 * rule instead of a code.
 */
export const CYCLE_CLOSE_RULE = {
  /** actualHarvestDate before the cycle's stockingDate: a negative cycle. */
  HARVEST_BEFORE_STOCKING: 'HARVEST_BEFORE_STOCKING',
  /**
   * Outcome HARVESTED with no fish out alive: no SOLD/REMOVED event was
   * recorded, so the summed count is zero. That is a FAILED cycle.
   */
  HARVESTED_WITH_ZERO: 'HARVESTED_WITH_ZERO',
  /** actualHarvestDate before the cycle's latest harvest event. */
  HARVEST_BEFORE_LAST_EVENT: 'HARVEST_BEFORE_LAST_EVENT',
} as const;

export type CycleCloseRule = (typeof CYCLE_CLOSE_RULE)[keyof typeof CYCLE_CLOSE_RULE];

const CYCLE_CLOSE_RULE_MESSAGES: Record<CycleCloseRule, Record<Lang, string>> = {
  [CYCLE_CLOSE_RULE.HARVEST_BEFORE_STOCKING]: {
    sw: 'Tarehe ya mavuno haiwezi kuwa kabla ya tarehe ya kupanda.',
    en: 'The harvest date cannot be before the stocking date.',
  },
  [CYCLE_CLOSE_RULE.HARVESTED_WITH_ZERO]: {
    sw: "Mavuno ya sifuri si mavuno. Hakuna samaki waliorekodiwa kutoka wakiwa hai (wameuzwa au wametolewa) - rekodi tukio la mavuno, au tumia matokeo 'Umeshindwa'.",
    en: "A harvest of zero is not a harvest. No fish were recorded leaving alive (sold or removed) - record a harvest event, or use the 'Failed' outcome.",
  },
  [CYCLE_CLOSE_RULE.HARVEST_BEFORE_LAST_EVENT]: {
    sw: 'Tarehe ya mavuno haiwezi kuwa kabla ya tukio la mwisho la mavuno.',
    en: 'The harvest date cannot be before the last harvest event.',
  },
};

/**
 * The ways `recordHarvestEvent` is refused that have no code of their own -
 * all plain VALIDATION_ERROR, so, as with the close rules, the CALLER names
 * the rule from what it already knows (the stocking date, today) rather than
 * reading the backend's prose.
 */
export const HARVEST_EVENT_RULE = {
  /** eventDate before the cycle's stockingDate. */
  BEFORE_STOCKING: 'BEFORE_STOCKING',
  /** eventDate after today (farm time). */
  IN_FUTURE: 'IN_FUTURE',
} as const;

export type HarvestEventRule = (typeof HARVEST_EVENT_RULE)[keyof typeof HARVEST_EVENT_RULE];

const HARVEST_EVENT_RULE_MESSAGES: Record<HarvestEventRule, Record<Lang, string>> = {
  [HARVEST_EVENT_RULE.BEFORE_STOCKING]: {
    sw: 'Tarehe ya tukio haiwezi kuwa kabla ya tarehe ya kupanda.',
    en: 'The event date cannot be before the stocking date.',
  },
  [HARVEST_EVENT_RULE.IN_FUTURE]: {
    sw: 'Tarehe ya tukio haiwezi kuwa ya baadaye.',
    en: 'The event date cannot be in the future.',
  },
};

/** The line for a named harvest-event rule, in the UI language. */
export function harvestEventRuleMessage(rule: HarvestEventRule, lang: Lang): string {
  return HARVEST_EVENT_RULE_MESSAGES[rule][lang];
}

/** The line for a named close rule, in the UI language. */
export function cycleCloseRuleMessage(rule: CycleCloseRule, lang: Lang): string {
  return CYCLE_CLOSE_RULE_MESSAGES[rule][lang];
}
