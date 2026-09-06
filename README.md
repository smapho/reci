# reci — レシート読み取り

index.html + JavaScript のスマホ対応アプリ。日本語OCRで写真を読み取り、修正後に既存Supabaseへ保存します。React・Next.js・ビルドは不要です。

## 起動

Node.js 22.9以降で実行します。

```sh
cp .env.example .env.local
# .env.local に既存Supabaseの値とアプリ用パスワードを入力
npm run dev
```

http://localhost:3000 を開き、接続設定で APP_PASSWORD と同じパスワードを入力します。設定前でも画像OCRと手入力の画面は利用できます。

## Vercelへの公開

1. このフォルダをGitHubへ登録し、VercelでImportします（またはVercel CLIでこのフォルダをデプロイ）。
2. Framework Preset: Other、Build Command: 未設定、Output Directory: 未設定にします。
3. Vercelの環境変数に以下を設定してデプロイします。

| 変数 | 内容 |
| --- | --- |
| SUPABASE_URL | codex2と同じSupabase Project URL。NEXT_PUBLIC_SUPABASE_URLも利用可 |
| SUPABASE_SECRET_KEY | Supabase DashboardのSecret key（`sb_secret_...`）。サーバーでのみ使用 |
| SUPABASE_SERVICE_ROLE_KEY | 旧形式のservice_roleキーを使う場合のみ。`SUPABASE_SECRET_KEY`を優先 |
| APP_PASSWORD | 必須。十分に長い私用アプリの共通パスワード |

発行されたHTTPS URLをスマホのSafari/Chromeで開いてください。カメラ撮影と写真選択に対応しています。パスワードはタブのsessionStorageに保存します。APIキーを画面へ入力する必要はありません。

## codex2の既存データを流用

`../codex2/supabase/migrations/001_receipts.sql` の構造を確認済みです。新しいテーブルやRLSポリシーの変更は不要です。

- receipts: merchant_name, purchase_date, total_amount, notes, image_url, currency を保存。他の税額等の列は既存のデフォルト値を使用します。
- receipt_items: receipt_id, name, quantity, amount, tax_rate（不明=0）を保存。
- Storage: 既存の receipt-images バケットを使用します。
- 写真はJPEGに縮小してStorageへ保存し、receipts.image_urlにURLを登録します。履歴には画像リンクを表示します。image_urlsの追加列は必須ではありません。
- OCR全文はnotesに保存します。税率・税額の自動判定は行いません。
- 最新100件を日付順に表示し、タップで明細を展開できます。

## 画像と読み取り

Tesseract.jsの日本語・英語OCRをブラウザ内で実行します。初回はOCRエンジンと辞書のダウンロードが必要です。画像自体は保存操作時にVercel経由でSupabaseへ送信されます。長いレシートや薄い文字は誤認識があるため、保存前に修正してください。JPEG/PNG/WebPなどブラウザで開ける画像に対応します。HEICを開けない端末ではJPEGへ変換してください。

写真URLはcodex2と同じ公開バケットのURLです。URLを知る人は写真を閲覧できます。共通パスワードはAPIへのアクセスを保護しますが、公開画像URLそのものは保護しません。

## 検証

```sh
npm test
```

APIの認証、入力検証、既存列への保存、明細失敗時の取り消しをモックで確認します。実際のSupabaseへの書き込みとVercel公開は環境変数とデプロイ先の設定後に確認してください。

参考: [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)、[Supabase Storage](https://supabase.com/docs/guides/storage)。
