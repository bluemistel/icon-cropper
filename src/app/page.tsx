"use client";
import dynamic from "next/dynamic";

const IconCropper = dynamic(() => import("@/components/IconCropper"), {
  ssr: false,
});

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="bg-header-bg text-gray-300 px-6 py-4 shadow-lg">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            アイコン切り抜きツール
          </h1>
          <p className="text-sm opacity-90 mt-1">
            画像をドラッグ＆ドロップするか選択して、円形に切り抜いてPNGでダウンロードできます。
          </p>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <IconCropper />
      </main>
    </div>
  );
}
