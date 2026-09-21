/**
 * Shared control sizing. The app is used from a phone, so every control clears
 * a 44px touch target (`min-h-11`) and uses a comfortable label size. Keeping
 * the classes here stops each call site from re-deciding the size.
 */
const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

export const BUTTON_PRIMARY = `${BASE} bg-neutral-100 text-neutral-900 hover:bg-white`;

export const BUTTON_GHOST = `${BASE} border border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700 hover:text-neutral-100`;

export const BUTTON_QUIET = `${BASE} text-neutral-400 hover:text-neutral-100`;

export const BUTTON_DANGER = `${BASE} text-neutral-500 hover:text-red-400`;

/** Full-width variant for forms (login) where the control is the only action. */
export const BUTTON_BLOCK = `${BUTTON_PRIMARY} w-full`;

/** Selects and text inputs, sized to match the buttons above. */
export const CONTROL =
  "min-h-11 rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-base text-neutral-100 outline-none focus:border-neutral-600";

export const FIELD = `${CONTROL} w-full py-2.5 placeholder:text-neutral-600`;
