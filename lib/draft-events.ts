// Pages save unsaved input to sessionStorage when this event fires, just before the page is
// replaced by a language switch or by the stale-chunk reload in SiteLayout. Cancelling it keeps
// the current page.
export const LANGUAGE_SWITCH_EVENT = 'nittei-language-switch'
export const RELOAD_DETAIL = 'reload'
