# hamamidaira-watcher

浜見平保育園の一時預かり（初回オリエンテーション）予約カレンダー（kViewer）を毎時チェックし、新しい枠が出たらメールで知らせる Cloudflare Worker。

## 仕組み
- kViewer の公開ビューは `GET /internal/public/api/view/<viewCode>/records/all` から予約枠（レコード）を JSON で取得している。Cookie もトークンも不要で、2026-10-05 の時点では `{"records":[]}`（枠なし）が返ってきた。
- フィルタ無しで呼ぶと全件が返る。レコードが1件でもあれば「枠あり」とみなし、通知済みでないものだけをメールする（KV で重複を防止）。
- 取得に失敗したとき（待合室の画面が返る・仕様変更など）は、1日1回だけ失敗通知のメールを送る。

## セットアップ
```bash
npm i -D wrangler @cloudflare/workers-types
npx wrangler login
npx wrangler kv namespace create SEEN      # 出力された id を wrangler.toml に貼る
npx wrangler secret put RESEND_API_KEY     # Resend の API キー
npx wrangler dev --test-scheduled          # ローカルで動作確認
#   → http://localhost:8787/__scheduled?cron=7+23,0-11+*+*+* を開いて "no new slots (total 0)" が出ればOK
npx wrangler deploy
```

## メール（Resend）
- `onboarding@resend.dev` から送れるのは、**Resend アカウントを登録したメールアドレス宛てだけ**。ttp7015@gmail.com で Resend に登録すれば、そのまま使える。
- それ以外の宛先に送る場合は、Resend で自分のドメインを認証して `MAIL_FROM` を変更する。

## 注意
- このサイトの robots.txt は自動アクセスを許可していない。アクセスは1時間に1回までにとどめること。
- レコードの項目名はまだ分からない（今は枠がゼロのため）。最初の通知では全項目をそのまま並べて送る。
