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
 * POND, BWAWA.") and that beats our generic line - at the cost of being
 * Swahili even in English UI. Read-only screens leave it off.
 */
export function apiErrorMessage(error: ApiError, lang: Lang, preferBackendMessage = false): string {
  if (preferBackendMessage && error.errorCode && error.message) {
    return error.message;
  }

  const mapped = error.errorCode ? ERROR_CODE_MESSAGES[error.errorCode] : undefined;
  return mapped ? mapped[lang] : FALLBACK_MESSAGE[lang];
}
