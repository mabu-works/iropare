# 📜 更新履歴

更新履歴はこのファイルに記録します。

## v1.0.0（2026-11-28）

### 追加

- コアロジック（色変換・パレット生成・色抽出の選色・お気に入りの整形）の単体テスト 29 件（`tests/`、node:test、依存なし）
- CI に手動実行（workflow_dispatch）と単体テストのステップを追加

### 変更

- 全リポジトリ作り直しの一環として、同一仕様のままゼロから再実装。バージョンを 1.0.0 にリセット（旧 Web 版は日付管理）
- 純粋ロジックを `js/color-core.js` に分離（挙動は同一）
- Service Worker のキャッシュ名を `iropare-v1` にリセット（旧コードは `iropare-v2`）
- Windows 版 exe は GitHub Release への添付をやめ、`windows/build.bat` / `build.sh` での各自ビルドに一本化
