// 浜見平保育園 一時預かり（初回オリエンテーション）空き枠ウォッチャー
// kViewer の公開ビューが裏で叩いている JSON API を直接読み、
// 新しい予約枠（レコード）が出たら Resend 経由でメール通知する。

export interface Env {
  SEEN: KVNamespace;
  RESEND_API_KEY: string; // wrangler secret put RESEND_API_KEY
  MAIL_FROM: string;      // 例: "Hamamidaira Watcher <onboarding@resend.dev>"
  MAIL_TO: string;        // 例: "ttp7015@gmail.com"
}

const VIEW_CODE = "445e5020f6897286e6563ac9befebd4ac42cc49f0d6cb0b6eef0b20a31e732c3";
const ORIGIN = "https://2e00b992.viewer.kintoneapp.com";
const API_URL = `${ORIGIN}/internal/public/api/view/${VIEW_CODE}/records/all`;
const PAGE_URL = `${ORIGIN}/public/${VIEW_CODE}`;

type KRecord = Record<string, { type?: string; value?: unknown } | unknown>;

function recordId(rec: KRecord): string {
  const id = (rec["$id"] as { value?: unknown } | undefined)?.value ?? (rec as any).id;
  return id != null ? String(id) : JSON.stringify(rec);
}

function describe(rec: KRecord): string {
  const skip = new Set(["$id", "$revision", "作成者", "更新者", "作成日時", "更新日時", "レコード番号"]);
  return Object.entries(rec)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => {
      const val = v && typeof v === "object" && "value" in (v as object) ? (v as any).value : v;
      return `  ${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val ?? "")}`;
    })
    .join("\n");
}

async function sendMail(env: Env, subject: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [env.MAIL_TO], subject, text }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

async function check(env: Env): Promise<string> {
  const res = await fetch(API_URL, {
    headers: { Accept: "application/json", Referer: PAGE_URL },
  });
  const body = await res.text();

  let records: KRecord[];
  try {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = JSON.parse(body);
    if (!Array.isArray(json.records)) throw new Error("records がない");
    records = json.records;
  } catch (e) {
    // 待合室が挟まった・仕様変更など。エラー通知は1日1回まで。
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const key = `error:${today}`;
    if (!(await env.SEEN.get(key))) {
      await env.SEEN.put(key, "1", { expirationTtl: 2 * 86400 });
      await sendMail(env, "【浜見平ウォッチャー】チェック失敗",
        `空き枠の取得に失敗しました（${(e as Error).message}）。\n応答の先頭:\n${body.slice(0, 500)}\n\n手動で確認: ${PAGE_URL}`);
    }
    return `error: ${(e as Error).message}`;
  }

  const fresh: KRecord[] = [];
  for (const rec of records) {
    const id = recordId(rec);
    if (!(await env.SEEN.get(`seen:${id}`))) fresh.push(rec);
  }
  if (fresh.length === 0) return `no new slots (total ${records.length})`;

  const text =
    `浜見平保育園 一時預かり（初回オリエンテーション）に新しい予約枠が出ました（${fresh.length}件）。\n\n` +
    fresh.map((r, i) => `■ ${i + 1}\n${describe(r)}`).join("\n\n") +
    `\n\n予約ページ: ${PAGE_URL}`;
  await sendMail(env, `【浜見平保育園】一時預かりに空きが出ました（${fresh.length}件）`, text);

  for (const rec of fresh) {
    await env.SEEN.put(`seen:${recordId(rec)}`, "1", { expirationTtl: 90 * 86400 });
  }
  return `notified ${fresh.length}`;
}

export default {
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(check(env).then((r) => console.log(r)));
  },
  // 動作確認用: `wrangler dev` 中に http://localhost:8787/ を開くと1回チェックする
  async fetch(_req: Request, env: Env) {
    return new Response(await check(env));
  },
};
