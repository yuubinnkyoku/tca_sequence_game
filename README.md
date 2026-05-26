# TCA Finder Game (Vite + React + TypeScript + GitHub Pages)

## 起動
```bash
npm install
npm run dev
```

## GitHub Pages公開
このリポジトリ名 `tca_sequence_game` に合わせて `vite.config.ts` の `base` は `/tca_sequence_game/` に設定済み。

GitHub Pages は Actions で `dist` をビルドして公開する。

GitHub の `Settings` -> `Pages` で `Build and deployment` の `Source` を `GitHub Actions` にする。

公開URL:
`https://yuubinnkyoku.github.io/tca_sequence_game/`

## 仕様
- Ensembl REST API (`/sequence/region`) からヒトゲノム領域の塩基配列を取得
- 取得失敗時はローカルのフォールバック配列を使用
- プレイヤーは `TCA` の開始位置（0始まり）をグリッド上でクリックして当てる
