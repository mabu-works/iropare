"use strict";

// ==========================================
// 🎨 いろぱれ Web アプリ（画面まわり）
// 色の計算は js/color-core.js（IropareCore）に寄せ、ここは DOM と
// ブラウザ API（Canvas / Clipboard / localStorage）の配線だけを行う。
// ==========================================
const Core = window.IropareCore;

// ==========================================
// 🗂️ 状態
// ==========================================
let currentPalette = []; // HEX文字列の配列（"#RRGGBB"）
let favorites = loadFavorites(); // {colors: string[], time: number} 新しい順

// ==========================================
// 🧩 DOM要素
// ==========================================
const $ = (id) => document.getElementById(id);
const paletteArea = $("paletteArea");
const copyMsg = $("copyMsg");
const imageMsg = $("imageMsg");
const strategySelect = $("strategySelect");

// ==========================================
// 🖼️ パレット表示
// ==========================================
// 🖼️ 現在のパレットを画面に描く
function renderPalette() {
  paletteArea.innerHTML = "";
  currentPalette.forEach((hex) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.title = hex + " をコピー";
    const color = document.createElement("span");
    color.className = "swatch-color";
    color.style.background = hex;
    const label = document.createElement("span");
    label.className = "swatch-hex";
    label.textContent = hex;
    btn.appendChild(color);
    btn.appendChild(label);
    btn.addEventListener("click", () => copyText(hex, hex + " をコピーしました。"));
    paletteArea.appendChild(btn);
  });
}

// 🎨 パレットを差し替えて再描画する
function setPalette(colors) {
  currentPalette = colors.slice();
  renderPalette();
}

// 📋 テキストをクリップボードへコピーする
async function copyText(text, doneMsg) {
  try {
    await navigator.clipboard.writeText(text);
    copyMsg.textContent = doneMsg;
  } catch (e) {
    // 📋 クリップボードが使えない環境ではテキストを表示して手動コピーを促す
    copyMsg.textContent = text;
  }
}

$("copyAllBtn").addEventListener("click", () => {
  if (!currentPalette.length) return;
  const text = Core.paletteToCopyText(currentPalette);
  copyText(text, "すべてのHEXをコピーしました：" + text);
});

// ==========================================
// 🎨 パレット生成
// ==========================================
$("generateBtn").addEventListener("click", () => {
  setPalette(Core.generatePalette(strategySelect.value));
  copyMsg.textContent = "新しいパレットを生成しました。";
});

// ==========================================
// 🖼️ 画像からの色抽出
// ==========================================
// 🖼️ 画像を縮小キャンバスへ描き、画素データをコアへ渡して代表色を得る
function extractColors(img) {
  const canvas = $("workCanvas");
  const size = Core.sampleSize(img.naturalWidth, img.naturalHeight);
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return Core.pickColorsFromPixels(data);
}

// 📷 画像ファイルを受け取って色を抽出する
function handleImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    imageMsg.textContent = "画像ファイルを選んでください。";
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    $("previewImg").src = url;
    $("previewWrap").hidden = false;
    try {
      const colors = extractColors(img);
      if (colors.length === 0) {
        imageMsg.textContent = "色を抽出できませんでした。別の画像でお試しください。";
        return;
      }
      setPalette(colors);
      imageMsg.textContent = "画像から " + colors.length + " 色を抽出しました。";
      copyMsg.textContent = "";
    } catch (e) {
      imageMsg.textContent = "画像の読み込みに失敗しました。";
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    imageMsg.textContent = "画像の読み込みに失敗しました。";
  };
  img.src = url;
}

const fileInput = $("fileInput");
const dropZone = $("dropZone");
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener("change", () => {
  handleImageFile(fileInput.files[0]);
  fileInput.value = "";
});
["dragenter", "dragover"].forEach((type) => {
  dropZone.addEventListener(type, (e) => { e.preventDefault(); dropZone.classList.add("is-dragover"); });
});
["dragleave", "drop"].forEach((type) => {
  dropZone.addEventListener(type, (e) => { e.preventDefault(); dropZone.classList.remove("is-dragover"); });
});
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  handleImageFile(file);
});

// ==========================================
// ⭐ お気に入り（localStorage）
// ==========================================
// ⭐ お気に入りをlocalStorageから読み込む
function loadFavorites() {
  try {
    return Core.parseFavorites(localStorage.getItem(Core.STORAGE_KEY));
  } catch (e) {
    return [];
  }
}

// ⭐ お気に入りをlocalStorageへ保存する
function saveFavorites() {
  try { localStorage.setItem(Core.STORAGE_KEY, JSON.stringify(favorites)); } catch (e) { /* 💾 保存できない環境では無視 */ }
}

// ⭐ お気に入り一覧を描く
function renderFavorites() {
  const list = $("favoritesList");
  list.innerHTML = "";
  favorites.forEach((fav, idx) => {
    const item = document.createElement("div");
    item.className = "fav-item";

    const swatches = document.createElement("div");
    swatches.className = "fav-swatches";
    fav.colors.forEach((hex) => {
      const s = document.createElement("span");
      s.className = "fav-swatch";
      s.style.background = hex;
      s.title = hex;
      swatches.appendChild(s);
    });

    const meta = document.createElement("div");
    meta.className = "fav-meta";
    const time = document.createElement("span");
    time.className = "fav-time";
    time.textContent = new Date(fav.time).toLocaleString("ja-JP", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }) + " ・ " + fav.colors.join(" ");

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "btn btn-sub";
    loadBtn.textContent = "読み込む";
    loadBtn.addEventListener("click", () => {
      setPalette(fav.colors);
      copyMsg.textContent = "お気に入りのパレットを読み込みました。";
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-sub";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => {
      favorites.splice(idx, 1);
      saveFavorites();
      renderFavorites();
    });

    meta.appendChild(time);
    meta.appendChild(loadBtn);
    meta.appendChild(delBtn);
    item.appendChild(swatches);
    item.appendChild(meta);
    list.appendChild(item);
  });
  $("favoritesEmpty").style.display = favorites.length ? "none" : "";
  $("clearFavoritesBtn").disabled = favorites.length === 0;
}

$("saveBtn").addEventListener("click", () => {
  if (!currentPalette.length) return;
  favorites = Core.addFavorite(favorites, currentPalette, Date.now());
  saveFavorites();
  renderFavorites();
  copyMsg.textContent = "お気に入りに保存しました。";
});

$("clearFavoritesBtn").addEventListener("click", () => {
  favorites = [];
  saveFavorites();
  renderFavorites();
});

// ==========================================
// 🌙 テーマ（ダーク／ライト）
// ==========================================
// 🌙 テーマを初期化し、切り替えボタンを設定する
(function initTheme() {
  var root = document.documentElement;
  if (!root || !root.getAttribute || !root.setAttribute) return;
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
  }
  var current = root.getAttribute("data-theme");
  if (current !== "light" && current !== "dark") {
    try { current = localStorage.getItem(Core.THEME_KEY); } catch (e) { current = null; }
  }
  apply(current === "light" ? "light" : "dark");
  var btn = document.getElementById("themeToggle");
  if (btn && btn.addEventListener) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      apply(next);
      try { localStorage.setItem(Core.THEME_KEY, next); } catch (e) { /* 💾 保存できなくても切り替え自体は有効 */ }
    });
  }
})();

// ==========================================
// 🚀 初期化
// ==========================================
setPalette(Core.generatePalette("analogous"));
renderFavorites();
