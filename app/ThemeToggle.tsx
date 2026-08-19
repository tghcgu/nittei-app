"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "nittei-theme";
const THEME_CHANGE_EVENT = "nittei-theme-change";

function getSnapshot(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(onStoreChange: () => void) {
  // 別タブでの切り替えは localStorage にしか反映されないため、
  // 自タブの DOM に適用してから再描画を通知する
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== STORAGE_KEY) return;
    document.documentElement.dataset.theme =
      event.newValue === "dark" ? "dark" : "light";
    onStoreChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";

  useLayoutEffect(() => {
    let storedTheme: Theme = "light";

    try {
      storedTheme =
        localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
      // localStorage が使えない環境ではライトモードのまま表示する
    }

    if (document.documentElement.dataset.theme !== storedTheme) {
      document.documentElement.dataset.theme = storedTheme;
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    }
  }, []);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        const nextTheme = isDark ? "light" : "dark";
        applyTheme(nextTheme);
      }}
      aria-label={isDark ? "ライトモードに切り替える" : "ダークモードに切り替える"}
      title={isDark ? "ライトモード" : "ダークモード"}
    >
      <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
    </button>
  );
}
