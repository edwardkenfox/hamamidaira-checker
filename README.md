# hamamidaira-watcher

浜見平保育園の一時預かり（初回オリエンテーション）予約カレンダー（kViewer）を毎時チェックし、新しい枠が出たらメールで知らせる Cloudflare Worker。

## 仕組み
- kViewer の公開ビューは `GET /internal/public/api/view/<viewCode>/records/all` から予約枠（レコード）を JSON で取得している。Cookie もトークンも不要で、2026-10-05 の時点では `{"records":[]}`（枠なし）が返ってきた。
- フィルタ無しで呼ぶと全件が返る。レコードが1件でもあれば「枠あり」とみなし、通知済みでないものだけをメールする（KV で重複を防止）。
- 取得に失敗したとき（待合室の画面が返る・仕様変更など）は、1日1回だけ失敗通知のメールを送る。

## セットアップ
```bash
npm install
npx wrangler login
npx wrangler email routing enable edwardkenfox.com                # ドメインにメール用の DNS レコード（MX など）が追加される
npx wrangler email routing addresses create ttp7015@gmail.com     # 届いた確認メールのリンクを開いて検証する
npx wrangler kv namespace create SEEN      # 出力された id を wrangler.toml に貼る
npx wrangler dev                           # ローカルで動作確認
#   → http://localhost:8787/ を開いて "no new slots (total 0)" が出ればOK
npx wrangler deploy
```

## メール（Cloudflare Email Service）
- `send_email` バインディングで送る。API キーは不要。
- 送信元（`MAIL_FROM`）は Email Routing を有効にしたドメインのアドレスにする。
- 宛先は `MAIL_TO` にカンマ区切りで並べる。宛先ごとに1通ずつ送る。
- 送れるのは**アカウントで検証済みの宛先アドレス宛てだけ**。この範囲なら Workers Free でも無料で、送信数の上限にも数えられない。
- それ以外の宛先に送る場合は、ドメインを Email Sending にオンボードする（Workers Paid プランが必要）。
- `wrangler dev` ではメールは実際には送られない。実際に送って試すなら `wrangler.toml` の `[[send_email]]` に `remote = true` を足し、デプロイ前に外す。

## 注意
- このサイトの robots.txt は自動アクセスを許可していない。アクセスは1時間に1回までにとどめること。
- レコードの項目名はまだ分からない（今は枠がゼロのため）。最初の通知では全項目をそのまま並べて送る。
