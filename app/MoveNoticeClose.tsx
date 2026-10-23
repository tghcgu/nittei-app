"use client";

// 住所が変わったお知らせ（app/SiteLayout.tsx）を閉じるボタン。閉じたことはこの端末に覚え、
// 次からは app/SiteLayout.tsx の themeInitScript が、描く前にお知らせを隠す
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
