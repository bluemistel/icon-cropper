"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
};

type PointerState = {
  isDragging: boolean;
  lastX: number;
  lastY: number;
};

type TouchState = {
  isPinching: boolean;
  initialDistance: number;
  initialScale: number;
  centerX: number;
  centerY: number;
};

const CANVAS_SIZE = 512; // 出力の基準解像度

const SIZE_PRESETS = [
  { label: "96x96", value: 96 },
  { label: "128x128", value: 128 },
  { label: "256x256", value: 256 },
  { label: "512x512", value: 512 },
  { label: "1024x1024", value: 1024 },
];

export default function IconCropper() {
  const dropRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // 画像の表示位置とズーム（scale）はキャンバス座標系で管理
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [scale, setScale] = useState<number>(1);

  // 背景色と透過
  const [bgColor, setBgColor] = useState<string>("#ffffff");
  const [transparent, setTransparent] = useState<boolean>(false);

  // 縁取り設定
  const [borderEnabled, setBorderEnabled] = useState<boolean>(false);
  const [borderWidth, setBorderWidth] = useState<number>(4);
  const [borderColor, setBorderColor] = useState<string>("#333333");

  const [fileName, setFileName] = useState<string>("icon.png");
  const [exportSize, setExportSize] = useState<number>(128);
  const [customSize, setCustomSize] = useState<string>("128x128");

  const pointer = useRef<PointerState>({ isDragging: false, lastX: 0, lastY: 0 });
  const touch = useRef<TouchState>({ 
    isPinching: false, 
    initialDistance: 0, 
    initialScale: 1, 
    centerX: 0, 
    centerY: 0 
  });

  const revokeUrl = useCallback(() => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => () => revokeUrl(), [revokeUrl]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    revokeUrl();
    setImageUrl(url);

    const img = new Image();
    img.onload = () => {
      setLoadedImage({ element: img, width: img.naturalWidth, height: img.naturalHeight });
      // 初期表示：画像をキャンバスに収めるようにスケールとオフセットを調整
      const minSide = Math.min(img.naturalWidth, img.naturalHeight);
      const initialScale = CANVAS_SIZE / minSide;
      setScale(initialScale);
      setOffsetX((CANVAS_SIZE - img.naturalWidth * initialScale) / 2);
      setOffsetY((CANVAS_SIZE - img.naturalHeight * initialScale) / 2);
      setFileName((file.name?.replace(/\.[^.]+$/, "") || "icon") + ".png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [revokeUrl]);

  // サイズ選択ハンドラー
  const handleSizePresetChange = useCallback((value: string) => {
    const preset = SIZE_PRESETS.find(p => p.value.toString() === value);
    if (preset) {
      setExportSize(preset.value);
      setCustomSize(preset.label);
    }
  }, []);

  const handleCustomSizeChange = useCallback((value: string) => {
    setCustomSize(value);
    // "128x128" のような形式からサイズを抽出
    const match = value.match(/^(\d+)x\d+$/);
    if (match) {
      const size = parseInt(match[1], 10);
      if (size >= 64 && size <= 2048) {
        setExportSize(size);
      }
    }
  }, []);

  // DnD
  useEffect(() => {
    const drop = dropRef.current;
    if (!drop) return;
    const prevent = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDrop = (e: DragEvent) => {
      prevent(e);
      const dt = e.dataTransfer;
      if (!dt) return;
      handleFiles(dt.files);
    };
    drop.addEventListener("dragenter", prevent);
    drop.addEventListener("dragover", prevent);
    drop.addEventListener("drop", onDrop);
    return () => {
      drop.removeEventListener("dragenter", prevent);
      drop.removeEventListener("dragover", prevent);
      drop.removeEventListener("drop", onDrop);
    };
  }, [handleFiles]);

  // キャンバス描画
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    if (!transparent) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // チェッカーパターンで透過を視覚化
      const gridSize = 16;
      for (let y = 0; y < canvas.height; y += gridSize) {
        for (let x = 0; x < canvas.width; x += gridSize) {
          const even = ((x / gridSize) + (y / gridSize)) % 2 === 0;
          ctx.fillStyle = even ? "#ddd" : "#fff";
          ctx.fillRect(x, y, gridSize, gridSize);
        }
      }
    }

    // マスク：円形（縁取りがある場合は内側に収める）
    const maxRadius = canvas.width / 2;
    const clipRadius = borderEnabled && borderWidth > 0 
      ? maxRadius - borderWidth 
      : maxRadius;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, clipRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // 画像描画
    if (loadedImage) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        loadedImage.element,
        offsetX,
        offsetY,
        loadedImage.width * scale,
        loadedImage.height * scale
      );
    }

    ctx.restore();

    // 縁取り描画（内側に描画）
    if (borderEnabled && borderWidth > 0) {
      ctx.beginPath();
      // 縁取りの中心がクリッピング領域の端に来るように
      const borderRadius = clipRadius - borderWidth / 2;
      ctx.arc(canvas.width / 2, canvas.height / 2, borderRadius, 0, Math.PI * 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
    } else {
      // 縁取りなしの場合は薄い枠線のみ（視覚的なガイド）
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, maxRadius - 1, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [bgColor, transparent, loadedImage, offsetX, offsetY, scale, borderEnabled, borderWidth, borderColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    draw();
  }, [draw]);

  // ドラッグ移動
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointer.current = { isDragging: true, lastX: e.clientX, lastY: e.clientY };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointer.current.isDragging) return;
    const dx = e.clientX - pointer.current.lastX;
    const dy = e.clientY - pointer.current.lastY;
    pointer.current.lastX = e.clientX;
    pointer.current.lastY = e.clientY;
    setOffsetX((x) => x + dx);
    setOffsetY((y) => y + dy);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointer.current.isDragging = false;
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
  }, []);

  // ホイールでズーム（滑らかなズーム）
  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    // より滑らかなズーム係数
    const zoomFactor = Math.exp(-e.deltaY * 0.0005);
    const newScale = Math.max(0.1, Math.min(10, scale * zoomFactor));
    
    // マウス位置を中心としたズーム
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // キャンバス座標系に変換
    const canvasX = (mouseX / rect.width) * CANVAS_SIZE;
    const canvasY = (mouseY / rect.height) * CANVAS_SIZE;
    
    // ズーム中心を計算
    const scaleRatio = newScale / scale;
    const newOffsetX = canvasX - (canvasX - offsetX) * scaleRatio;
    const newOffsetY = canvasY - (canvasY - offsetY) * scaleRatio;
    
    setScale(newScale);
    setOffsetX(newOffsetX);
    setOffsetY(newOffsetY);
  }, [scale, offsetX, offsetY]);

  // タッチジェスチャー対応
  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getTouchCenter = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return { x: 0, y: 0 };
    const x = (touches[0].clientX + touches[1].clientX) / 2;
    const y = (touches[0].clientY + touches[1].clientY) / 2;
    return { x, y };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    if (e.touches.length === 2) {
      // ピンチ開始
      const distance = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      const rect = e.currentTarget.getBoundingClientRect();
      
      touch.current = {
        isPinching: true,
        initialDistance: distance,
        initialScale: scale,
        centerX: (center.x - rect.left) / rect.width * CANVAS_SIZE,
        centerY: (center.y - rect.top) / rect.height * CANVAS_SIZE,
      };
    } else if (e.touches.length === 1) {
      // ドラッグ開始
      pointer.current = { 
        isDragging: true, 
        lastX: e.touches[0].clientX, 
        lastY: e.touches[0].clientY 
      };
    }
  }, [scale, getTouchDistance, getTouchCenter]);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    if (e.touches.length === 2 && touch.current.isPinching) {
      // ピンチ中
      const distance = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      const rect = e.currentTarget.getBoundingClientRect();
      
      const scaleRatio = distance / touch.current.initialDistance;
      const newScale = Math.max(0.1, Math.min(10, touch.current.initialScale * scaleRatio));
      
      // ピンチ中心を基準にズーム
      const canvasX = (center.x - rect.left) / rect.width * CANVAS_SIZE;
      const canvasY = (center.y - rect.top) / rect.height * CANVAS_SIZE;
      
      const scaleRatio2 = newScale / scale;
      const newOffsetX = canvasX - (canvasX - offsetX) * scaleRatio2;
      const newOffsetY = canvasY - (canvasY - offsetY) * scaleRatio2;
      
      setScale(newScale);
      setOffsetX(newOffsetX);
      setOffsetY(newOffsetY);
    } else if (e.touches.length === 1 && pointer.current.isDragging) {
      // ドラッグ中
      const dx = e.touches[0].clientX - pointer.current.lastX;
      const dy = e.touches[0].clientY - pointer.current.lastY;
      pointer.current.lastX = e.touches[0].clientX;
      pointer.current.lastY = e.touches[0].clientY;
      setOffsetX((x) => x + dx);
      setOffsetY((y) => y + dy);
    }
  }, [scale, offsetX, offsetY, getTouchDistance, getTouchCenter]);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    pointer.current.isDragging = false;
    touch.current.isPinching = false;
  }, []);

  // 依存が変わるたびに再描画
  useEffect(() => {
    draw();
  }, [draw, offsetX, offsetY, scale, bgColor, transparent, loadedImage]);

  const handleDownload = useCallback(() => {
    const srcCanvas = canvasRef.current;
    if (!srcCanvas) return;

    // 任意サイズで書き出し
    const outCanvas = document.createElement("canvas");
    outCanvas.width = exportSize;
    outCanvas.height = exportSize;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return;

    // 背景
    if (!transparent) {
      outCtx.fillStyle = bgColor;
      outCtx.fillRect(0, 0, exportSize, exportSize);
    }

    // 円形マスク（縁取りがある場合は内側に収める）
    const maxR = exportSize / 2;
    const scaleRatio = exportSize / CANVAS_SIZE;
    const outputBorderWidth = borderEnabled && borderWidth > 0 
      ? (borderWidth * exportSize) / CANVAS_SIZE 
      : 0;
    const clipR = maxR - outputBorderWidth;
    
    outCtx.save();
    outCtx.beginPath();
    outCtx.arc(maxR, maxR, clipR, 0, Math.PI * 2);
    outCtx.closePath();
    outCtx.clip();

    if (loadedImage) {
      // スケールとオフセットを出力解像度に合わせて換算
      outCtx.imageSmoothingQuality = "high";
      outCtx.drawImage(
        loadedImage.element,
        offsetX * scaleRatio,
        offsetY * scaleRatio,
        loadedImage.width * scale * scaleRatio,
        loadedImage.height * scale * scaleRatio
      );
    }
    outCtx.restore();

    // 縁取り描画（出力時、内側に描画）
    if (borderEnabled && borderWidth > 0 && outputBorderWidth > 0) {
      outCtx.beginPath();
      // 縁取りの中心がクリッピング領域の端に来るように
      const borderR = clipR - outputBorderWidth / 2;
      outCtx.arc(maxR, maxR, borderR, 0, Math.PI * 2);
      outCtx.strokeStyle = borderColor;
      outCtx.lineWidth = outputBorderWidth;
      outCtx.stroke();
    }

    const link = document.createElement("a");
    link.download = fileName || "icon.png";
    link.href = outCanvas.toDataURL("image/png");
    link.click();
  }, [bgColor, transparent, loadedImage, offsetX, offsetY, scale, fileName, exportSize, borderEnabled, borderWidth, borderColor]);

  if (!loadedImage) {
    // 画像がアップロードされていない場合はアップロードUIのみ表示
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div 
          ref={dropRef}
          className="bg-white/90 border-2 border-dashed border-accent-bg rounded-2xl p-12 text-center max-w-md mx-auto shadow-lg hover:shadow-xl transition-shadow duration-300"
        >
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-accent-bg rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-header-bg mb-2">画像をアップロード</h2>
              <p className="text-sm text-gray-600 mb-4">
                ドラッグ＆ドロップするか、ファイルを選択してください
              </p>
              <label className="inline-block bg-accent-bg text-white px-6 py-3 rounded-lg font-medium cursor-pointer hover:bg-opacity-90 transition-colors">
                ファイルを選択
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFiles(e.target.files)}
                  className="hidden"
                />
              </label>
            </div>
            <div className="text-xs text-gray-500">
              対応フォーマット: JPG, PNG, GIF, WebP
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* キャンバスエディター */}
      <div className="bg-white/90 rounded-2xl p-6 shadow-lg">
        <h2 className="text-lg font-bold text-header-bg mb-4">編集</h2>
        <div className="flex justify-center mb-4">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="w-[min(100%,400px)] h-[min(100%,400px)] touch-none rounded-xl border-2 border-gray-200 bg-white shadow-inner"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onWheel={onWheel}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            />
          </div>
        </div>
        <div className="text-center text-sm text-gray-600">
          ドラッグで位置移動、ホイールでズーム、スマホではピンチでズーム
        </div>
      </div>

      {/* 設定パネル */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* 背景設定 */}
        <div className="bg-white/90 rounded-2xl p-6 shadow-lg">
          <h3 className="text-lg font-bold text-header-bg mb-4">背景設定</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-12 h-12 rounded-lg border-2 border-gray-200 cursor-pointer"
                disabled={transparent}
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-bg"
                placeholder="#ffffff"
                disabled={transparent}
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={transparent} 
                onChange={(e) => setTransparent(e.target.checked)}
                className="w-5 h-5 text-accent-bg rounded focus:ring-accent-bg"
              />
              <span className="text-gray-700">透明背景を使用</span>
            </label>
          </div>
        </div>

        {/* 縁取り設定 */}
        <div className="bg-white/90 rounded-2xl p-6 shadow-lg">
          <h3 className="text-lg font-bold text-header-bg mb-4">縁取り設定</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={borderEnabled} 
                onChange={(e) => setBorderEnabled(e.target.checked)}
                className="w-5 h-5 text-accent-bg rounded focus:ring-accent-bg"
              />
              <span className="text-gray-700">縁取りを有効にする</span>
            </label>
            
            {borderEnabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    太さ: {borderWidth}px
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={borderWidth}
                    onChange={(e) => setBorderWidth(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="w-12 h-12 rounded-lg border-2 border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-bg"
                    placeholder="#000000"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* サイズ設定 */}
        <div className="bg-white/90 rounded-2xl p-6 shadow-lg">
          <h3 className="text-lg font-bold text-header-bg mb-4">サイズ設定</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">プリセット</label>
              <select
                value={exportSize}
                onChange={(e) => handleSizePresetChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-bg"
              >
                {SIZE_PRESETS.map(preset => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">サイズ</label>
              <input
                type="text"
                value={customSize}
                onChange={(e) => handleCustomSizeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-bg"
                placeholder="128x128"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ダウンロードパネル */}
      <div className="bg-white/90 rounded-2xl p-6 shadow-lg">
        <h3 className="text-lg font-bold text-header-bg mb-4">ダウンロード</h3>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">ファイル名</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-bg"
              placeholder="icon.png"
            />
          </div>
          <button
            onClick={handleDownload}
            className="bg-accent-bg text-white px-8 py-3 rounded-lg font-medium hover:bg-opacity-90 transition-colors shadow-lg hover:shadow-xl"
          >
            PNGをダウンロード
          </button>
        </div>
      </div>

      {/* 新しい画像をアップロード */}
      <div className="text-center">
        <label className="inline-block bg-gray-500 text-white px-6 py-3 rounded-lg font-medium cursor-pointer hover:bg-gray-600 transition-colors">
          新しい画像をアップロード
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}


