"use client";

// 住所が変わったお知らせ（app/SiteLayout.tsx）を閉じるボタン。閉じたことはこの端末に覚える。
// 一度見せた時点で themeInitScript も覚えるので、押さなくても次のページからは出ない。
// このボタンは、今見ているページですぐ消したいとき用
export function MoveNoticeClose({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="move-notice-close"
      aria-label={label}
      onClick={() => {
        document.documentElement.dataset.moveNotice = "closed";
        try {
          localStorage.setItem("nittei-move-notice", "closed");
        } catch {
          // 保存できない端末では、このページの間だけ隠す
        }
      }}
    >
      ×
    </button>
  );
}
