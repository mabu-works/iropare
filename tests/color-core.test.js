"use strict";

// ==========================================
// 🧪 いろぱれ コアロジックのテスト（node:test、依存なし）
// 色変換・生成の不変条件・抽出の選色・保存形式を固定する。
// ==========================================
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../js/color-core.js");

// 🎲 決定的な乱数（mulberry32）— 生成テストを再現可能にする
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 🎨 テスト用に HEX を HSL へ戻す
function hexToHsl(hex) {
  const { r, g, b } = Core.hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

// 📐 色相の符号つき差（-180〜180）
function signedHueDiff(a, b) {
  return (((a - b) % 360) + 540) % 360 - 180;
}

const HEX_RE = /^#[0-9A-F]{6}$/;

// ==========================================
// 📦 定数（保存形式の互換性）
// ==========================================
test("storage keys and limits stay compatible with existing users", () => {
  assert.equal(Core.STORAGE_KEY, "iropare-favorites-v1");
  assert.equal(Core.THEME_KEY, "iropare-theme");
  assert.equal(Core.MAX_FAVORITES, 50);
  assert.equal(Core.GENERATED_COLOR_COUNT, 5);
  assert.equal(Core.IMAGE_COLOR_COUNT, 6);
  assert.equal(Core.SAMPLE_MAX, 150);
});

// ==========================================
// 🎨 色変換
// ==========================================
test("rgbToHex formats, rounds and clamps", () => {
  assert.equal(Core.rgbToHex(255, 0, 0), "#FF0000");
  assert.equal(Core.rgbToHex(10, 11, 12), "#0A0B0C");
  assert.equal(Core.rgbToHex(300, -5, 127.5), "#FF0080"); // 範囲外は丸め、.5は切り上げ
  assert.equal(Core.rgbToHex(106, 141, 255), "#6A8DFF");
});

test("hslToHex matches known colors", () => {
  assert.equal(Core.hslToHex(0, 100, 50), "#FF0000");
  assert.equal(Core.hslToHex(60, 100, 50), "#FFFF00");
  assert.equal(Core.hslToHex(120, 100, 50), "#00FF00");
  assert.equal(Core.hslToHex(240, 100, 50), "#0000FF");
  assert.equal(Core.hslToHex(0, 0, 0), "#000000");
  assert.equal(Core.hslToHex(0, 0, 100), "#FFFFFF");
});

test("hslToHex wraps hue and clamps saturation/lightness", () => {
  assert.equal(Core.hslToHex(480, 100, 50), "#00FF00"); // 360+120
  assert.equal(Core.hslToHex(-120, 100, 50), "#0000FF"); // 負の色相
  assert.equal(Core.hslToHex(0, 200, 50), "#FF0000"); // 彩度は100に丸める
  assert.equal(Core.hslToHex(0, 100, 150), "#FFFFFF"); // 明度は100に丸める
});

test("hexToRgb parses and round-trips with rgbToHex", () => {
  assert.deepEqual(Core.hexToRgb("#6A8DFF"), { r: 106, g: 141, b: 255 });
  for (const hex of ["#000000", "#FFFFFF", "#2DD4BF", "#7048E8"]) {
    const { r, g, b } = Core.hexToRgb(hex);
    assert.equal(Core.rgbToHex(r, g, b), hex);
  }
});

test("colorDistance is the squared RGB distance", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  assert.equal(Core.colorDistance(black, black), 0);
  assert.equal(Core.colorDistance(black, white), 3 * 255 * 255);
});

// ==========================================
// 🎨 パレット生成の不変条件
// ==========================================
for (const strategy of ["analogous", "complementary", "triadic", "split", "monochrome", "random"]) {
  test(`generatePalette("${strategy}") returns 5 valid HEX colors`, () => {
    const colors = Core.generatePalette(strategy, mulberry32(42));
    assert.equal(colors.length, 5);
    for (const hex of colors) assert.match(hex, HEX_RE);
  });
}

test("generatePalette is deterministic for a seeded rng", () => {
  const a = Core.generatePalette("analogous", mulberry32(7));
  const b = Core.generatePalette("analogous", mulberry32(7));
  assert.deepEqual(a, b);
});

test("analogous hues step by 18 degrees around the base", () => {
  const colors = Core.generatePalette("analogous", mulberry32(3));
  const hues = colors.map((hex) => hexToHsl(hex).h);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(signedHueDiff(hues[i], hues[2] + (i - 2) * 18)) <= 3,
      `i=${i} hue=${hues[i]} base=${hues[2]}`);
  }
});

test("complementary hues alternate 180 degrees apart", () => {
  const colors = Core.generatePalette("complementary", mulberry32(5));
  const hues = colors.map((hex) => hexToHsl(hex).h);
  assert.ok(Math.abs(signedHueDiff(hues[2], hues[0])) <= 3);
  assert.ok(Math.abs(signedHueDiff(hues[4], hues[0])) <= 3);
  assert.ok(Math.abs(Math.abs(signedHueDiff(hues[1], hues[0])) - 180) <= 3);
  assert.ok(Math.abs(Math.abs(signedHueDiff(hues[3], hues[0])) - 180) <= 3);
});

test("triadic hues cycle in 120 degree steps", () => {
  const colors = Core.generatePalette("triadic", mulberry32(9));
  const hues = colors.map((hex) => hexToHsl(hex).h);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(signedHueDiff(hues[i], hues[0] + (i % 3) * 120)) <= 3, `i=${i}`);
  }
});

test("split hues follow the 0/150/210 pattern", () => {
  const colors = Core.generatePalette("split", mulberry32(11));
  const hues = colors.map((hex) => hexToHsl(hex).h);
  const offsets = [0, 150, 210, 0, 150];
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(signedHueDiff(hues[i], hues[0] + offsets[i])) <= 3, `i=${i}`);
  }
});

test("monochrome keeps one hue and steps lightness 24 + i*14", () => {
  const colors = Core.generatePalette("monochrome", mulberry32(13));
  const hsl = colors.map(hexToHsl);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(signedHueDiff(hsl[i].h, hsl[2].h)) <= 6, `i=${i} hue=${hsl[i].h}`);
    assert.ok(Math.abs(hsl[i].l - (24 + i * 14)) <= 1.5, `i=${i} l=${hsl[i].l}`);
  }
});

test("generated saturation and lightness stay in range", () => {
  for (let seed = 0; seed < 40; seed++) {
    for (const strategy of Core.RANDOM_POOL) {
      for (const hex of Core.generatePalette(strategy, mulberry32(seed))) {
        const { s, l } = hexToHsl(hex);
        assert.ok(s >= 10 && s <= 100, `${strategy} seed=${seed} s=${s}`);
        assert.ok(l >= 15 && l <= 90, `${strategy} seed=${seed} l=${l}`);
      }
    }
  }
});

// ==========================================
// 🖼️ 画像抽出
// ==========================================
// 🖼️ 指定色の画素列（RGBA）を作る: [[r,g,b,a,count], ...]
function pixels(spec) {
  const arr = [];
  for (const [r, g, b, a, count] of spec) {
    for (let i = 0; i < count; i++) arr.push(r, g, b, a);
  }
  return new Uint8ClampedArray(arr);
}

test("sampleSize shrinks to a 150px max edge and never enlarges", () => {
  assert.deepEqual(Core.sampleSize(300, 100), { width: 150, height: 50 });
  assert.deepEqual(Core.sampleSize(100, 80), { width: 100, height: 80 });
  assert.deepEqual(Core.sampleSize(1000, 333), { width: 150, height: 50 });
  assert.deepEqual(Core.sampleSize(200, 200), { width: 150, height: 150 });
  assert.deepEqual(Core.sampleSize(1, 1), { width: 1, height: 1 });
});

test("pickColorsFromPixels returns the single dominant color", () => {
  const data = pixels([[255, 0, 0, 255, 4]]);
  assert.deepEqual(Core.pickColorsFromPixels(data), ["#FF0000"]);
});

test("pickColorsFromPixels skips nearly transparent pixels", () => {
  assert.deepEqual(Core.pickColorsFromPixels(pixels([[255, 0, 0, 0, 3]])), []);
  assert.deepEqual(Core.pickColorsFromPixels(pixels([[255, 0, 0, 124, 3]])), []);
  assert.deepEqual(Core.pickColorsFromPixels(pixels([[255, 0, 0, 125, 3]])), ["#FF0000"]);
});

test("pickColorsFromPixels averages colors inside one quantization bucket", () => {
  // 248 と 255 はどちらも >>3 で 31 のバケット → 平均 251.5 → 252
  const data = pixels([[248, 0, 0, 255, 1], [255, 0, 0, 255, 1]]);
  assert.deepEqual(Core.pickColorsFromPixels(data), ["#FC0000"]);
  // 8 と 15 も同じバケット（>>3 = 1）→ 平均 11.5 → 12
  const data2 = pixels([[8, 0, 0, 255, 1], [15, 0, 0, 255, 1]]);
  assert.deepEqual(Core.pickColorsFromPixels(data2), ["#0C0000"]);
});

test("pickColorsFromPixels orders by frequency and caps at 6", () => {
  const corners = [
    [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255],
    [255, 255, 0], [255, 0, 255], [0, 255, 255], [255, 255, 255]
  ];
  const spec = corners.map(([r, g, b], i) => [r, g, b, 255, 8 - i]); // 件数は 8..1 の降順
  const colors = Core.pickColorsFromPixels(pixels(spec));
  assert.equal(colors.length, 6);
  assert.deepEqual(colors, ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF"]);
});

test("pickColorsFromPixels thins near colors first, then backfills by frequency", () => {
  // 近い色同士（距離の二乗 225 < 1600）だけの画像では、間引き後に補充されて両方出る
  const data = pixels([[255, 0, 0, 255, 5], [250, 10, 10, 255, 4]]);
  assert.deepEqual(Core.pickColorsFromPixels(data), ["#FF0000", "#FA0A0A"]);
});

test("pickColorsFromPixels prefers a distant color over a near one", () => {
  // 赤（最多）→ 近い赤紫は間引き → 青が2番目に来る。補充で赤紫が最後に付く
  const data = pixels([
    [255, 0, 0, 255, 10],
    [250, 10, 10, 255, 8],
    [0, 0, 255, 255, 6]
  ]);
  assert.deepEqual(Core.pickColorsFromPixels(data), ["#FF0000", "#0000FF", "#FA0A0A"]);
});

// ==========================================
// 📋 コピー形式
// ==========================================
test("paletteToCopyText joins HEX codes with single spaces", () => {
  assert.equal(Core.paletteToCopyText(["#FF0000", "#00FF00", "#0000FF"]), "#FF0000 #00FF00 #0000FF");
  assert.equal(Core.paletteToCopyText(["#FF0000"]), "#FF0000");
  assert.equal(Core.paletteToCopyText([]), "");
});

// ==========================================
// ⭐ お気に入りの整形
// ==========================================
test("parseFavorites tolerates broken data and filters invalid entries", () => {
  assert.deepEqual(Core.parseFavorites(null), []);
  assert.deepEqual(Core.parseFavorites(""), []);
  assert.deepEqual(Core.parseFavorites("not json"), []);
  assert.deepEqual(Core.parseFavorites("{}"), []);
  const raw = JSON.stringify([
    { colors: ["#FF0000"], time: 100 },
    { colors: [], time: 200 },
    { time: 300 },
    null,
    { colors: ["#00FF00", "#0000FF"], time: 400 }
  ]);
  assert.deepEqual(Core.parseFavorites(raw), [
    { colors: ["#FF0000"], time: 100 },
    { colors: ["#00FF00", "#0000FF"], time: 400 }
  ]);
});

test("addFavorite prepends without mutating and caps at MAX_FAVORITES", () => {
  const before = [{ colors: ["#111111"], time: 1 }];
  const after = Core.addFavorite(before, ["#222222"], 2);
  assert.equal(before.length, 1); // 元の配列は不変
  assert.deepEqual(after, [
    { colors: ["#222222"], time: 2 },
    { colors: ["#111111"], time: 1 }
  ]);

  let list = [];
  for (let i = 0; i < 55; i++) list = Core.addFavorite(list, ["#00000" + (i % 10)], i);
  assert.equal(list.length, Core.MAX_FAVORITES);
  assert.equal(list[0].time, 54); // 新しい順
  assert.equal(list[list.length - 1].time, 5); // 古いものから落ちる
});
