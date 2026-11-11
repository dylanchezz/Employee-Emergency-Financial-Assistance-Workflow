// Phase 7 (G2) — light/dark theme state.
//
// The choice lives on <html data-theme="light|dark"> (globals.css swaps the token values on it) and
// is remembered in localStorage. With no saved choice, there is NO data-theme attribute and the
// CSS follows the OS setting (prefers-color-scheme). THEME_INIT_SCRIPT runs in <head> before the
// page paints, so a saved "dark" never flashes light first.

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const CHANGE_EVENT = "themechange";

// Inline in the root layout's <head>. Kept tiny and defensive (storage can throw in private modes).
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

// The theme actually showing: the explicit choice if any, else the OS preference.
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return systemPrefersDark() ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not saved (private mode etc.) — still applied for this page view.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// For useSyncExternalStore: re-render on our own toggle, another tab's toggle, or an OS change.
export function subscribeTheme(onChange: () => void): () => void {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    if (e.newValue === "light" || e.newValue === "dark") {
      document.documentElement.setAttribute("data-theme", e.newValue);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", onChange);
  };
}
