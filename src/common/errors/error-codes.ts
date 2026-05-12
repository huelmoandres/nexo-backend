import { ERRORS } from './error-catalog';

export { ERRORS };

/** Claves del catálogo `ERRORS` — único tipo permitido para `buildProblem`. */
export type ErrorCode = keyof typeof ERRORS;
