"use strict";

// ==========================================
// 🎨 いろぱれ コアロジック（DOM非依存）
// 色変換・パレット生成・画像抽出の選色・お気に入りの整形を担う。
// ブラウザでは window.IropareCore、Node では module.exports として使う。
// ==========================================
(function (global) {

  // ==========================================
  // 📦 定数
  // ==========================================
  const STORAGE_KEY = "iropare-favorites-v1"; // お気に入りの localStorage キー
  const THEME_KEY = "iropare-theme"; // テーマの localStorage キー
  const MAX_FAVORITES = 50; // お気に入りの上限
  const IMAGE_COLOR_COUNT = 6; // 画像抽出で表示する色数
  const GENERATED_COLOR_COUNT = 5; // 生成パレットの色数
  const SAMPLE_MAX = 150; // 抽出時のサンプリング用キャンバス最大辺
  const MIN_DISTANCE = 40 * 40; // 抽出時に「近すぎる色」とみなすRGB距離の二乗
  const STRATEGIES = ["random", "analogous", "complementary", "triadic", "split", "monochrome"];
  const RANDOM_POOL = ["analogous", "complementary", "triadic", "split", "monochrome"];

  // ==========================================
  // 🎨 色ユーティリティ
  // ==========================================
  // 🔧 値を指定範囲内に収める
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  // 🎨 RGBをHEXに変換する（"#RRGGBB"、大文字）
  function rgbToHex(r, g, b) {
    const p = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    return ("#" + p(r) + p(g) + p(b)).toUpperCase();
  }

  // 🎨 HSLをHEXに変換する（h: 0–359、s/l: 0–100）
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  // 🎨 HEXをRGBに変換する
  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  // 📏 2色のRGB距離（二乗和）を求める
  function colorDistance(a, b) {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
  }

  // ==========================================
  // 🎲 乱数（テストで差し替え可能）
  // ==========================================
  // 🎲 min以上max未満の乱数を返す
  function rand(rng, min, max) { return min + rng() * (max - min); }
  // 🎲 min以上max以下の整数乱数を返す
  function randInt(rng, min, max) { return Math.floor(rand(rng, min, max + 1)); }

  // ==========================================
  // 🎨 パレット生成（HSLハーモニー）
  // ==========================================
  // 🎨 調和ルールでパレットを生成する（HEX文字列の配列を返す）
  function generatePalette(strategy, rng) {
    rng = rng || Math.random;
    if (strategy === "random") {
      strategy = RANDOM_POOL[randInt(rng, 0, RANDOM_POOL.length - 1)];
    }
    const baseHue = randInt(rng, 0, 359);
    const baseSat = randInt(rng, 55, 85);
    const baseLight = randInt(rng, 42, 62);
    const hslList = [];

    if (strategy === "analogous") {
      // ↔️ 基準色の前後30度ずつに広げる
      for (let i = 0; i < GENERATED_COLOR_COUNT; i++) {
        hslList.push([baseHue + (i - 2) * 18, clamp(baseSat + randInt(rng, -12, 12), 25, 95), clamp(baseLight + (i - 2) * 7, 22, 85)]);
      }
    } else if (strategy === "complementary") {
      // 🔄 基準色とその補色（+180度）を交互に、明度を変えて並べる
      for (let i = 0; i < GENERATED_COLOR_COUNT; i++) {
        const hue = i % 2 === 0 ? baseHue : baseHue + 180;
        hslList.push([hue, clamp(baseSat + randInt(rng, -10, 10), 25, 95), clamp(baseLight + (i - 2) * 8, 22, 85)]);
      }
    } else if (strategy === "triadic") {
      // 🔺 120度ずつ離れた3色相を循環させる
      for (let i = 0; i < GENERATED_COLOR_COUNT; i++) {
        const hue = baseHue + (i % 3) * 120;
        hslList.push([hue, clamp(baseSat + randInt(rng, -10, 10), 25, 95), clamp(baseLight + (i - 2) * 6, 22, 85)]);
      }
    } else if (strategy === "split") {
      // 🔀 基準色 + 補色の両隣（150度・210度）
      const hues = [baseHue, baseHue + 150, baseHue + 210, baseHue, baseHue + 150];
      for (let i = 0; i < GENERATED_COLOR_COUNT; i++) {
        hslList.push([hues[i], clamp(baseSat + randInt(rng, -10, 10), 25, 95), clamp(baseLight + (i - 2) * 7, 22, 85)]);
      }
    } else {
      // 🎨 モノクローム：色相を固定し、明度（と少しの彩度）を段階的に変える
      for (let i = 0; i < GENERATED_COLOR_COUNT; i++) {
        hslList.push([baseHue, clamp(baseSat + (i - 2) * 5, 15, 95), 24 + i * 14]);
      }
    }
    return hslList.map(([h, s, l]) => hslToHex(h, s, l));
  }

  // ==========================================
  // 🖼️ 画像からの色抽出（画素データに対する純粋処理）
  // ==========================================
  // 📐 サンプリング用キャンバスの寸法を求める（最大辺 SAMPLE_MAX、拡大はしない）
  function sampleSize(naturalWidth, naturalHeight) {
    const scale = Math.min(1, SAMPLE_MAX / Math.max(naturalWidth, naturalHeight));
    return {
      width: Math.max(1, Math.round(naturalWidth * scale)),
      height: Math.max(1, Math.round(naturalHeight * scale))
    };
  }

  // 🖼️ RGBA画素データから代表色を選ぶ
  // RGBを32段階に量子化したバケットの出現頻度（簡易クラスタリング）で平均色を作り、
  // 頻度順に、既に選んだ色と近すぎないものを優先して選ぶ。足りなければ頻度順に補充する。
  function pickColorsFromPixels(data) {
    const buckets = new Map(); // key -> {count, r, g, b（合計）}
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 125) continue; // ほぼ透明な画素は除外
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { count: 0, r: 0, g: 0, b: 0 }; buckets.set(key, bucket); }
      bucket.count++;
      bucket.r += r; bucket.g += g; bucket.b += b;
    }

    const averaged = Array.from(buckets.values()).map((bk) => ({
      count: bk.count,
      r: bk.r / bk.count, g: bk.g / bk.count, b: bk.b / bk.count
    })).sort((x, y) => y.count - x.count);

    // 🔍 頻度順に、既に選んだ色と近すぎないものを優先して選ぶ
    const picked = [];
    for (const c of averaged) {
      if (picked.length >= IMAGE_COLOR_COUNT) break;
      if (picked.every((p) => colorDistance(p, c) >= MIN_DISTANCE)) picked.push(c);
    }
    // ➕ 色数が足りなければ頻度順に補充する
    if (picked.length < IMAGE_COLOR_COUNT) {
      for (const c of averaged) {
        if (picked.length >= IMAGE_COLOR_COUNT) break;
        if (!picked.includes(c)) picked.push(c);
      }
    }
    return picked.map((c) => rgbToHex(c.r, c.g, c.b));
  }

  // ==========================================
  // 📋 コピー形式
  // ==========================================
  // 📋 「HEXをすべてコピー」の文字列を作る（半角スペース区切り）
  function paletteToCopyText(colors) {
    return colors.join(" ");
  }

  // ==========================================
  // ⭐ お気に入り（localStorage のデータ整形）
  // ==========================================
  // ⭐ 保存済みJSONを検証して配列に戻す（壊れたデータは空扱い）
  function parseFavorites(raw) {
    if (!raw) return [];
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f) => f && Array.isArray(f.colors) && f.colors.length > 0);
  }

  // ⭐ 先頭に1件追加して上限に収めた新しい配列を返す（元の配列は変更しない）
  function addFavorite(favorites, colors, time) {
    const next = [{ colors: colors.slice(), time: time }].concat(favorites);
    if (next.length > MAX_FAVORITES) next.length = MAX_FAVORITES;
    return next;
  }

  const api = {
    STORAGE_KEY, THEME_KEY, MAX_FAVORITES, IMAGE_COLOR_COUNT,
    GENERATED_COLOR_COUNT, SAMPLE_MAX, MIN_DISTANCE, STRATEGIES, RANDOM_POOL,
    clamp, rgbToHex, hslToHex, hexToRgb, colorDistance,
    generatePalette, sampleSize, pickColorsFromPixels,
    paletteToCopyText, parseFavorites, addFavorite
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.IropareCore = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
