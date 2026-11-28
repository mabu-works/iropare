using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

namespace Iropare
{
    internal static class Program
    {
        // 🚀 アプリを起動する
        [STAThread]
        private static void Main()
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
        }
    }

    // ==========================================
    // 🎨 色ロジック（Web版 js/color-core.js と同じ方式）
    // ==========================================
    internal static class ColorLogic
    {
        public const int GeneratedColorCount = 5;
        public const int ImageColorCount = 6;
        public const int SampleMax = 150;

        private const double MinDistance = 40 * 40; // 「近すぎる色」のRGB距離の二乗

        private static readonly Random Rng = new Random();

        // 🔧 値を指定範囲内に収める
        public static double Clamp(double v, double min, double max) => Math.Min(max, Math.Max(min, v));

        // 🔢 JS の Math.round（0.5 は切り上げ）に合わせる
        private static int JsRound(double v) => (int)Math.Floor(v + 0.5);

        // 🎨 RGBをHEXに変換する
        public static string RgbToHex(double r, double g, double b)
        {
            string Part(double v) => Clamp(JsRound(v), 0, 255).ToString("X2");
            return "#" + Part(r) + Part(g) + Part(b);
        }

        // 🎨 HSLをHEXに変換する（h: 0–359、s/l: 0–100）
        public static string HslToHex(double h, double s, double l)
        {
            h = ((h % 360) + 360) % 360;
            s = Clamp(s, 0, 100) / 100;
            l = Clamp(l, 0, 100) / 100;
            double c = (1 - Math.Abs(2 * l - 1)) * s;
            double x = c * (1 - Math.Abs(((h / 60) % 2) - 1));
            double m = l - c / 2;
            double r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; }
            else if (h < 120) { r = x; g = c; }
            else if (h < 180) { g = c; b = x; }
            else if (h < 240) { g = x; b = c; }
            else if (h < 300) { r = x; b = c; }
            else { r = c; b = x; }
            return RgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
        }

        // 🎨 HEXをRGBに変換する
        public static (int R, int G, int B) HexToRgb(string hex)
        {
            return (Convert.ToInt32(hex.Substring(1, 2), 16),
                    Convert.ToInt32(hex.Substring(3, 2), 16),
                    Convert.ToInt32(hex.Substring(5, 2), 16));
        }

        // 📏 2色のRGB距離（二乗和）を求める
        private static double ColorDistance((double R, double G, double B) a, (double R, double G, double B) b)
        {
            double dr = a.R - b.R, dg = a.G - b.G, db = a.B - b.B;
            return dr * dr + dg * dg + db * db;
        }

        // 🎲 min以上max以下の整数乱数を返す
        private static int RandInt(int min, int max) => Rng.Next(min, max + 1);

        // ==========================================
        // 🎨 パレット生成（HSLハーモニー）
        // ==========================================
        // 🎨 調和ルールでパレットを生成する
        public static List<string> GeneratePalette(string strategy)
        {
            if (strategy == "random")
            {
                var pool = new[] { "analogous", "complementary", "triadic", "split", "monochrome" };
                strategy = pool[RandInt(0, pool.Length - 1)];
            }
            int baseHue = RandInt(0, 359);
            int baseSat = RandInt(55, 85);
            int baseLight = RandInt(42, 62);
            var hslList = new List<(double H, double S, double L)>();

            switch (strategy)
            {
                case "analogous":
                    // ↔️ 基準色の前後30度ずつに広げる
                    for (int i = 0; i < GeneratedColorCount; i++)
                    {
                        hslList.Add((baseHue + (i - 2) * 18,
                            Clamp(baseSat + RandInt(-12, 12), 25, 95),
                            Clamp(baseLight + (i - 2) * 7, 22, 85)));
                    }
                    break;
                case "complementary":
                    // 🔄 基準色とその補色（+180度）を交互に、明度を変えて並べる
                    for (int i = 0; i < GeneratedColorCount; i++)
                    {
                        double hue = i % 2 == 0 ? baseHue : baseHue + 180;
                        hslList.Add((hue,
                            Clamp(baseSat + RandInt(-10, 10), 25, 95),
                            Clamp(baseLight + (i - 2) * 8, 22, 85)));
                    }
                    break;
                case "triadic":
                    // 🔺 120度ずつ離れた3色相を循環させる
                    for (int i = 0; i < GeneratedColorCount; i++)
                    {
                        double hue = baseHue + (i % 3) * 120;
                        hslList.Add((hue,
                            Clamp(baseSat + RandInt(-10, 10), 25, 95),
                            Clamp(baseLight + (i - 2) * 6, 22, 85)));
                    }
                    break;
                case "split":
                    {
                        // 🔀 基準色 + 補色の両隣（150度・210度）
                        var hues = new[] { baseHue, baseHue + 150, baseHue + 210, baseHue, baseHue + 150 };
                        for (int i = 0; i < GeneratedColorCount; i++)
                        {
                            hslList.Add((hues[i],
                                Clamp(baseSat + RandInt(-10, 10), 25, 95),
                                Clamp(baseLight + (i - 2) * 7, 22, 85)));
                        }
                    }
                    break;
                default:
                    // 🎨 モノクローム：色相を固定し、明度（と少しの彩度）を段階的に変える
                    for (int i = 0; i < GeneratedColorCount; i++)
                    {
                        hslList.Add((baseHue,
                            Clamp(baseSat + (i - 2) * 5, 15, 95),
                            24 + i * 14));
                    }
                    break;
            }
            return hslList.Select(t => HslToHex(t.H, t.S, t.L)).ToList();
        }

        // ==========================================
        // 🖼️ 画像からの色抽出
        // ==========================================
        private sealed class Bucket
        {
            public long Count;
            public long R, G, B;
        }

        private sealed class AvgColor
        {
            public long Count;
            public double R, G, B;
        }

        // 🖼️ 画像から代表色を抽出する
        // 縮小してサンプリングし、RGBを32段階に量子化したバケットの出現頻度から
        // 平均色を作り、頻度順に近すぎない色を優先して選ぶ（足りなければ補充）。
        public static List<string> ExtractColors(Bitmap src)
        {
            double scale = Math.Min(1.0, (double)SampleMax / Math.Max(src.Width, src.Height));
            int w = Math.Max(1, JsRound(src.Width * scale));
            int h = Math.Max(1, JsRound(src.Height * scale));

            using (var small = new Bitmap(w, h))
            {
                using (var g = Graphics.FromImage(small))
                {
                    g.InterpolationMode = InterpolationMode.HighQualityBilinear;
                    g.DrawImage(src, 0, 0, w, h);
                }

                var buckets = new Dictionary<int, Bucket>();
                for (int y = 0; y < h; y++)
                {
                    for (int x = 0; x < w; x++)
                    {
                        Color px = small.GetPixel(x, y);
                        if (px.A < 125) continue; // ほぼ透明な画素は除外
                        int key = ((px.R >> 3) << 10) | ((px.G >> 3) << 5) | (px.B >> 3);
                        if (!buckets.TryGetValue(key, out var bucket))
                        {
                            bucket = new Bucket();
                            buckets[key] = bucket;
                        }
                        bucket.Count++;
                        bucket.R += px.R; bucket.G += px.G; bucket.B += px.B;
                    }
                }

                var averaged = buckets.Values
                    .Select(bk => new AvgColor
                    {
                        Count = bk.Count,
                        R = (double)bk.R / bk.Count,
                        G = (double)bk.G / bk.Count,
                        B = (double)bk.B / bk.Count
                    })
                    .OrderByDescending(c => c.Count)
                    .ToList();

                var picked = new List<AvgColor>();
                foreach (var c in averaged)
                {
                    if (picked.Count >= ImageColorCount) break;
                    if (picked.All(p => ColorDistance((p.R, p.G, p.B), (c.R, c.G, c.B)) >= MinDistance)) picked.Add(c);
                }
                if (picked.Count < ImageColorCount)
                {
                    foreach (var c in averaged)
                    {
                        if (picked.Count >= ImageColorCount) break;
                        if (!picked.Contains(c)) picked.Add(c);
                    }
                }
                return picked.Select(c => RgbToHex(c.R, c.G, c.B)).ToList();
            }
        }
    }

    // ==========================================
    // ⭐ お気に入り1件（保存JSONの形式は従来どおり {Colors, Time}）
    // ==========================================
    internal sealed class FavoriteItem
    {
        public List<string> Colors { get; set; } = new List<string>();
        public long Time { get; set; }
    }

    // ==========================================
    // 🪟 メイン画面
    // ==========================================
    internal sealed class MainForm : Form
    {
        private static readonly Color Bg = Color.FromArgb(10, 15, 28);
        private static readonly Color Surface = Color.FromArgb(17, 26, 44);
        private static readonly Color Surface2 = Color.FromArgb(24, 38, 66);
        private static readonly Color TextColor = Color.FromArgb(236, 241, 248);
        private static readonly Color Muted = Color.FromArgb(157, 177, 199);
        private static readonly Color Accent = Color.FromArgb(106, 141, 255);

        private const int MaxFavorites = 50;

        private static readonly string[] StrategyIds =
            { "random", "analogous", "complementary", "triadic", "split", "monochrome" };

        private readonly FlowLayoutPanel palettePanel;
        private readonly Label copyMsg;
        private readonly ComboBox strategyBox;
        private readonly Label imageMsg;
        private readonly ListBox favoritesList;
        private readonly Button clearFavBtn;

        private List<string> currentPalette = new List<string>();
        private List<FavoriteItem> favorites = new List<FavoriteItem>();

        // 🎯 スポイト用
        private readonly Timer pickTimer;
        private bool picking = false;
        private bool pickSawRelease = false;

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out Point lpPoint);

        private const int VK_LBUTTON = 0x01;
        private const int VK_ESCAPE = 0x1B;

        public MainForm()
        {
            // 🪟 画面を組み立てる
            Text = "いろぱれ for Windows｜カラーパレットツール";
            ClientSize = new Size(560, 720);
            MinimumSize = new Size(576, 759);
            BackColor = Bg;
            ForeColor = TextColor;
            Font = new Font("Yu Gothic UI", 10F);
            AllowDrop = true;
            DragEnter += (s, e) =>
            {
                if (e.Data != null && e.Data.GetDataPresent(DataFormats.FileDrop)) e.Effect = DragDropEffects.Copy;
            };
            DragDrop += (s, e) =>
            {
                if (e.Data?.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
                    HandleImageFile(files[0]);
            };

            var title = new Label
            {
                Text = "いろぱれ｜カラーパレットツール",
                Font = new Font("Yu Gothic UI", 15F, FontStyle.Bold),
                ForeColor = TextColor,
                Location = new Point(20, 12),
                AutoSize = true
            };
            Controls.Add(title);

            palettePanel = new FlowLayoutPanel
            {
                Location = new Point(20, 52),
                Size = new Size(520, 96),
                BackColor = Bg,
                WrapContents = true
            };
            Controls.Add(palettePanel);

            copyMsg = new Label
            {
                Text = "",
                ForeColor = Muted,
                Location = new Point(20, 154),
                Size = new Size(520, 22)
            };
            Controls.Add(copyMsg);

            var copyAllBtn = MakeButton("HEXをすべてコピー", 20, 182, 170, false);
            copyAllBtn.Click += (s, e) =>
            {
                if (currentPalette.Count == 0) return;
                string joined = string.Join(" ", currentPalette);
                Clipboard.SetText(joined);
                copyMsg.Text = "すべてのHEXをコピーしました：" + joined;
            };
            Controls.Add(copyAllBtn);

            var saveBtn = MakeButton("お気に入りに保存", 202, 182, 170, true);
            saveBtn.Click += (s, e) =>
            {
                if (currentPalette.Count == 0) return;
                favorites.Insert(0, new FavoriteItem
                {
                    Colors = new List<string>(currentPalette),
                    Time = DateTimeOffset.Now.ToUnixTimeMilliseconds()
                });
                if (favorites.Count > MaxFavorites)
                    favorites.RemoveRange(MaxFavorites, favorites.Count - MaxFavorites);
                SaveFavorites();
                RenderFavorites();
                copyMsg.Text = "お気に入りに保存しました。";
            };
            Controls.Add(saveBtn);

            var pickBtn = MakeButton("画面の色を拾う（スポイト）", 384, 182, 176, false);
            pickBtn.Click += (s, e) => StartPicking();
            Controls.Add(pickBtn);

            Controls.Add(MakeLabel("生成のしかた", 20, 232));
            strategyBox = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Location = new Point(20, 256),
                Width = 300,
                BackColor = Surface2,
                ForeColor = TextColor
            };
            strategyBox.Items.AddRange(new object[]
            {
                "おまかせ（ランダム）",
                "アナロジー（類似色）",
                "補色（コンプリメンタリー）",
                "トライアド（三色配色）",
                "スプリット・コンプリメンタリー",
                "モノクローム（同系色）"
            });
            strategyBox.SelectedIndex = 0;
            Controls.Add(strategyBox);

            var generateBtn = MakeButton("新しいパレットを生成", 336, 252, 204, true);
            generateBtn.Click += (s, e) =>
            {
                SetPalette(ColorLogic.GeneratePalette(StrategyIds[strategyBox.SelectedIndex]));
                copyMsg.Text = "新しいパレットを生成しました。";
            };
            Controls.Add(generateBtn);

            Controls.Add(MakeLabel("画像から色を抽出", 20, 302));
            var imageBtn = MakeButton("画像を選ぶ", 20, 326, 160, false);
            imageBtn.Click += (s, e) =>
            {
                using (var dlg = new OpenFileDialog())
                {
                    dlg.Filter = "画像ファイル|*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp|すべてのファイル|*.*";
                    if (dlg.ShowDialog(this) == DialogResult.OK) HandleImageFile(dlg.FileName);
                }
            };
            Controls.Add(imageBtn);
            var dropNote = new Label
            {
                Text = "画像ファイルをこのウィンドウへドラッグ＆ドロップしても抽出できます。",
                ForeColor = Muted,
                Location = new Point(192, 334),
                AutoSize = true
            };
            Controls.Add(dropNote);

            imageMsg = new Label
            {
                Text = "",
                ForeColor = Muted,
                Location = new Point(20, 364),
                Size = new Size(520, 22)
            };
            Controls.Add(imageMsg);

            Controls.Add(MakeLabel("お気に入り", 20, 396));
            favoritesList = new ListBox
            {
                Location = new Point(20, 420),
                Size = new Size(520, 168),
                BackColor = Surface,
                ForeColor = TextColor,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Yu Gothic UI", 9F)
            };
            Controls.Add(favoritesList);

            var loadBtn = MakeButton("読み込む", 20, 598, 120, false);
            loadBtn.Click += (s, e) =>
            {
                int i = favoritesList.SelectedIndex;
                if (i < 0 || i >= favorites.Count) return;
                SetPalette(favorites[i].Colors);
                copyMsg.Text = "お気に入りのパレットを読み込みました。";
            };
            Controls.Add(loadBtn);
            var delBtn = MakeButton("削除", 152, 598, 120, false);
            delBtn.Click += (s, e) =>
            {
                int i = favoritesList.SelectedIndex;
                if (i < 0 || i >= favorites.Count) return;
                favorites.RemoveAt(i);
                SaveFavorites();
                RenderFavorites();
            };
            Controls.Add(delBtn);
            clearFavBtn = MakeButton("お気に入りをすべて削除", 284, 598, 200, false);
            clearFavBtn.Click += (s, e) =>
            {
                favorites = new List<FavoriteItem>();
                SaveFavorites();
                RenderFavorites();
            };
            Controls.Add(clearFavBtn);

            pickTimer = new Timer { Interval = 50 };
            pickTimer.Tick += PickTimerTick;

            // 🚀 初期表示（保存済みお気に入り + アナロジーの初期パレット）
            favorites = LoadFavorites();
            SetPalette(ColorLogic.GeneratePalette("analogous"));
            RenderFavorites();
        }

        // 🏷️ ラベルを作る
        private Label MakeLabel(string text, int x, int y)
        {
            return new Label { Text = text, ForeColor = Muted, Location = new Point(x, y), AutoSize = true };
        }

        // 🔘 ボタンを作る
        private Button MakeButton(string text, int x, int y, int w, bool primary)
        {
            var btn = new Button
            {
                Text = text,
                BackColor = primary ? Accent : Surface2,
                ForeColor = primary ? Color.White : TextColor,
                FlatStyle = FlatStyle.Flat,
                Location = new Point(x, y),
                Size = new Size(w, 34)
            };
            btn.FlatAppearance.BorderSize = 0;
            if (primary) btn.Font = new Font("Yu Gothic UI", 10F, FontStyle.Bold);
            return btn;
        }

        // 🖼️ パレットを差し替えて再描画する
        private void SetPalette(List<string> colors)
        {
            currentPalette = new List<string>(colors);
            palettePanel.Controls.Clear();
            foreach (string hex in currentPalette)
            {
                var rgb = ColorLogic.HexToRgb(hex);
                var color = Color.FromArgb(rgb.R, rgb.G, rgb.B);
                var swatch = new Panel
                {
                    Size = new Size(80, 88),
                    BackColor = Surface,
                    Margin = new Padding(0, 0, 8, 0),
                    Cursor = Cursors.Hand
                };
                var block = new Panel
                {
                    BackColor = color,
                    Location = new Point(0, 0),
                    Size = new Size(80, 58),
                    Cursor = Cursors.Hand
                };
                var label = new Label
                {
                    Text = hex,
                    ForeColor = TextColor,
                    Location = new Point(0, 62),
                    Size = new Size(80, 22),
                    TextAlign = ContentAlignment.MiddleCenter,
                    Font = new Font("Consolas", 9F),
                    Cursor = Cursors.Hand
                };
                string captured = hex;
                EventHandler onClick = (s, e) =>
                {
                    Clipboard.SetText(captured);
                    copyMsg.Text = captured + " をコピーしました。";
                };
                swatch.Click += onClick;
                block.Click += onClick;
                label.Click += onClick;
                swatch.Controls.Add(block);
                swatch.Controls.Add(label);
                palettePanel.Controls.Add(swatch);
            }
        }

        // 📷 画像ファイルを受け取って色を抽出する
        private void HandleImageFile(string path)
        {
            try
            {
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read))
                using (var img = Image.FromStream(fs))
                using (var bmp = new Bitmap(img))
                {
                    var colors = ColorLogic.ExtractColors(bmp);
                    if (colors.Count == 0)
                    {
                        imageMsg.Text = "色を抽出できませんでした。別の画像でお試しください。";
                        return;
                    }
                    SetPalette(colors);
                    imageMsg.Text = "画像から " + colors.Count + " 色を抽出しました。";
                    copyMsg.Text = "";
                }
            }
            catch (Exception)
            {
                imageMsg.Text = "画像の読み込みに失敗しました。";
            }
        }

        // ==========================================
        // 🎯 スポイト（画面の色を拾う、Windows版のみの機能）
        // ==========================================

        // 🎯 スポイトを開始する
        private void StartPicking()
        {
            if (picking) return;
            picking = true;
            pickSawRelease = false;
            copyMsg.Text = "画面上の拾いたい色をクリックしてください（Escで中止）。";
            pickTimer.Start();
        }

        // 🎯 スポイトのタイマー処理（Escで中止・クリックで色を拾う）
        private void PickTimerTick(object? sender, EventArgs e)
        {
            if ((GetAsyncKeyState(VK_ESCAPE) & 0x8000) != 0)
            {
                picking = false;
                pickTimer.Stop();
                copyMsg.Text = "スポイトを中止しました。";
                return;
            }
            bool down = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
            if (!down) { pickSawRelease = true; return; }
            if (!pickSawRelease) return; // 🖱️ ボタンを押したクリック自体は無視する

            picking = false;
            pickTimer.Stop();
            if (!GetCursorPos(out var pos)) return;

            using (var bmp = new Bitmap(1, 1))
            using (var g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(pos, Point.Empty, new Size(1, 1));
                Color px = bmp.GetPixel(0, 0);
                string hex = ColorLogic.RgbToHex(px.R, px.G, px.B);
                var next = new List<string>(currentPalette) { hex };
                SetPalette(next);
                Clipboard.SetText(hex);
                copyMsg.Text = hex + " を拾ってパレットに追加し、コピーしました。";
            }
        }

        // ==========================================
        // ⭐ お気に入りの保存・読み込み
        // ==========================================

        // 💾 お気に入りJSONの保存先パスを返す
        private static string FavoritesPath()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Iropare");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "favorites.json");
        }

        // ⭐ お気に入りをJSONファイルから読み込む
        private List<FavoriteItem> LoadFavorites()
        {
            try
            {
                string path = FavoritesPath();
                if (!File.Exists(path)) return new List<FavoriteItem>();
                var list = JsonSerializer.Deserialize<List<FavoriteItem>>(File.ReadAllText(path));
                if (list == null) return new List<FavoriteItem>();
                return list.Where(f => f.Colors != null && f.Colors.Count > 0).ToList();
            }
            catch (Exception)
            {
                return new List<FavoriteItem>();
            }
        }

        // ⭐ お気に入りをJSONファイルへ保存する
        private void SaveFavorites()
        {
            try
            {
                File.WriteAllText(FavoritesPath(), JsonSerializer.Serialize(favorites));
            }
            catch (Exception)
            {
                // 💾 保存できない環境では無視（Web版の localStorage と同じ扱い）
            }
        }

        // ⭐ お気に入り一覧を描く
        private void RenderFavorites()
        {
            favoritesList.Items.Clear();
            foreach (var fav in favorites)
            {
                var dt = DateTimeOffset.FromUnixTimeMilliseconds(fav.Time).LocalDateTime;
                string text = $"{dt.Month}/{dt.Day} {dt:HH:mm} ・ " + string.Join(" ", fav.Colors);
                favoritesList.Items.Add(text);
            }
            clearFavBtn.Enabled = favorites.Count > 0;
        }
    }
}
