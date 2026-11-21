import { formatTaipei } from "@/lib/jobs";
import { CountUp } from "./CountUp";
import {
  FEATURE_LABEL,
  compact,
  fmt,
  formatFeature,
  type AnalysisResult,
  type GroupKey,
  type Groups,
  type Insight,
  type Overview,
  type TopPost,
} from "@/lib/report";
import { KeywordChart, LengthChart, TimeEngagementChart, TimeHeatmap, TypeChart } from "./Charts";
import { CopyButton, ExpandableText, ReportNav } from "./ReportClient";

/** 分析報告（PRD F7）：總覽、Top posts、圖表、三群組、策略建議、資料限制。 */
export function Report({
  result,
  texts,
  previous,
}: {
  result: AnalysisResult;
  /** post_id → 貼文內容，供散佈圖滑過預覽 */
  texts?: Record<string, string>;
  /** 重跑前那次分析的總覽，用來顯示升降箭頭 */
  previous?: Overview | null;
}) {
  const { summary } = result;
  const sections = ["overview", "top-posts", "time", "types", ...(result.groups ? ["groups"] : []), "strategy"];
  return (
    <div className="flex flex-col gap-10" data-testid="report">
      <ReportNav available={sections} />
      <Section id="overview" title="總覽">
        <OverviewCards ov={summary.overview} prev={previous ?? null} />
      </Section>

      <Section
        id="top-posts"
        title="Top 5 貼文"
        note={result.top_posts.sort_by === "engagement_rate" ? "依粉絲基準互動率排序" : "粉絲數無法取得，依總互動排序"}
      >
        <TopPostsTable items={result.top_posts.items} byRate={result.top_posts.sort_by === "engagement_rate"} />
      </Section>

      <Section id="time" title="發文時段">
        <div className="chart-grid grid grid-cols-1 gap-4">
          <TimeHeatmap time={summary.time} />
          <TimeEngagementChart time={summary.time} />
        </div>
      </Section>

      <Section id="types" title="內容類型與長度">
        <div className="chart-grid grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TypeChart types={summary.types} />
          <LengthChart length={summary.length} texts={texts} />
          <div className="lg:col-span-2">
            <KeywordChart keywords={summary.keywords} />
          </div>
        </div>
      </Section>

      {result.groups && (
        <Section id="groups" title="高／中／低互動群組分析" note="互動分數 = 按讚 + 2 × 回覆">
          <GroupsView groups={result.groups} />
        </Section>
      )}

      <Section id="strategy" title="內容策略建議">
        <InsightsView insights={result.insights} generator={result.generator} />
      </Section>

      {summary.limitations && summary.limitations.length > 0 && (
        <Section title="資料限制">
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--chart-ink-2)]" data-testid="limitations">
            {summary.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ id, title, note, children }: { id?: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id ? `sec-${id}` : undefined} className="flex scroll-mt-28 animate-fade-up flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <span className="text-sm text-[var(--chart-muted)]">{note}</span>}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ 總覽

type Card = { label: string; value: string; sub?: string; delta?: number | null };

/** 與上一次分析相比的變化（百分比）；沒有上一次或數值缺漏就不顯示。 */
function change(cur: number | null | undefined, prev: number | null | undefined) {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function OverviewCards({ ov, prev }: { ov: Overview; prev: Overview | null }) {
  // 主要指標用大卡片，次要指標用小卡片
  const primary: Card[] = [
    {
      label: "平均粉絲基準互動率",
      value: ov.engagement_rate_pct.mean != null ? `${fmt(ov.engagement_rate_pct.mean, 2)}%` : "—",
      sub: ov.engagement_rate_pct.median != null ? `中位數 ${fmt(ov.engagement_rate_pct.median, 2)}%` : "無粉絲數",
      delta: change(ov.engagement_rate_pct.mean, prev?.engagement_rate_pct?.mean),
    },
    {
      label: "平均總互動",
      value: fmt(ov.engagement.mean, 0),
      sub: ov.outlier_count
        ? `不含 ${ov.outlier_count} 篇爆文：${fmt(ov.engagement_excl_outliers.mean, 0)}`
        : `中位數 ${fmt(ov.engagement.median, 0)}`,
      delta: change(ov.engagement.mean, prev?.engagement?.mean),
    },
    { label: "粉絲數", value: compact(ov.follower_count), delta: change(ov.follower_count, prev?.follower_count) },
  ];
  const secondary: Card[] = [
    { label: "貼文數", value: fmt(ov.post_count, 0), sub: ov.first_post_at ? `${formatTaipei(ov.first_post_at).slice(0, 10)} 起` : undefined },
    { label: "每週發文", value: ov.posts_per_week != null ? `${fmt(ov.posts_per_week)} 篇` : "—" },
    { label: "平均按讚", value: fmt(ov.likes.mean, 0), sub: `中位數 ${fmt(ov.likes.median, 0)}` },
    { label: "平均回覆", value: fmt(ov.replies.mean, 0), sub: `中位數 ${fmt(ov.replies.median, 0)}` },
    { label: "平均轉發", value: fmt(ov.reposts.mean, 0), sub: `引用 ${fmt(ov.quotes.mean, 0)}` },
  ];
  return (
    <dl className="flex flex-col gap-3" data-testid="overview">
      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
        {primary.map((c, i) => (
          <div
            key={c.label}
            style={{ "--i": i } as React.CSSProperties}
            className="lift flex min-h-32 flex-col rounded-xl border border-[var(--border-soft)] bg-surface p-4"
          >
            <dt className="text-sm text-[var(--chart-ink-2)]">{c.label}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                <CountUp value={c.value} />
              </span>
              <Delta value={c.delta} />
            </dd>
            {c.sub && <dd className="mt-auto text-xs text-[var(--chart-muted)]">{c.sub}</dd>}
          </div>
        ))}
      </div>
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-5">
        {secondary.map((c, i) => (
          <div key={c.label} style={{ "--i": i + 3 } as React.CSSProperties} className="rounded-xl border border-[var(--border-soft)] p-3">
            <dt className="text-xs text-[var(--chart-ink-2)]">{c.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              <CountUp value={c.value} />
            </dd>
            {c.sub && <dd className="text-xs text-[var(--chart-muted)]">{c.sub}</dd>}
          </div>
        ))}
      </div>
      {prev && <p className="text-xs text-[var(--chart-muted)]">箭頭為與重跑前那次分析相比的變化。</p>}
    </dl>
  );
}

function Delta({ value }: { value?: number | null }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span
      className={`text-sm font-medium tabular-nums ${up ? "text-accent" : "text-danger"}`}
      data-testid="kpi-delta"
      aria-label={`較上次${up ? "增加" : "減少"} ${Math.abs(value).toFixed(1)}%`}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ------------------------------------------------------------------ Top posts

function TopPostsTable({ items, byRate }: { items: TopPost[]; byRate: boolean }) {
  const metric = (p: TopPost) => (byRate ? p.engagement_rate_pct : p.engagement) ?? 0;
  const max = Math.max(1e-9, ...items.map(metric));
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-surface">
      <table className="w-full min-w-[720px] text-left text-sm" data-testid="top-posts">
        <thead className="text-[var(--chart-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">內容</th>
            <th className="px-3 py-2 font-medium">發文時間</th>
            <th className="px-3 py-2 text-right font-medium">按讚</th>
            <th className="px-3 py-2 text-right font-medium">回覆</th>
            <th className="px-3 py-2 text-right font-medium">轉發</th>
            <th className="px-3 py-2 font-medium">{byRate ? "粉絲基準互動率" : "總互動"}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={p.post_id} className="border-t border-[var(--chart-grid)] align-top">
              <td className="px-3 py-2.5 tabular-nums">{i + 1}</td>
              <td className="max-w-md px-3 py-2.5">
                <ExpandableText text={p.text} />
                <a href={p.post_url} target="_blank" rel="noopener noreferrer" className="link text-xs">
                  看原文 ↗
                </a>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[var(--chart-ink-2)]">{formatTaipei(p.published_at)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.likes, 0)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.replies, 0)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt((p.reposts ?? 0) + (p.quotes ?? 0), 0)}</td>
              <td className="px-3 py-2.5">
                <div className="flex min-w-32 items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-soft)]" aria-hidden>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(metric(p) / max) * 100}%`, background: i === 0 ? "var(--chart-best)" : "var(--chart-bar)" }}
                    />
                  </span>
                  <span className="w-14 text-right font-medium tabular-nums">
                    {byRate ? `${fmt(p.engagement_rate_pct, 2)}%` : fmt(p.engagement, 0)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ 三群組

const GROUP_ORDER: GroupKey[] = ["high", "mid", "low"];
const GROUP_COLOR: Record<GroupKey, string> = { high: "var(--group-high)", mid: "var(--group-mid)", low: "var(--group-low)" };

function GroupsView({ groups }: { groups: Groups }) {
  if (groups.skipped || !groups.groups) {
    return (
      <p className="text-sm text-[var(--chart-ink-2)]" data-testid="groups-skipped">
        {groups.reason}
      </p>
    );
  }
  const g = groups.groups;
  const featureKeys = Object.keys(g.high.features);
  return (
    <div className="flex flex-col gap-4" data-testid="groups">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {GROUP_ORDER.map((k) => (
          <div
            key={k}
            className="flex flex-col gap-3 rounded-xl border border-l-[3px] border-[var(--border-soft)] bg-surface p-4"
            style={{ borderLeftColor: GROUP_COLOR[k] }}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{g[k].label}</h3>
              <span className="text-sm text-[var(--chart-muted)]">{g[k].size} 篇</span>
              {g[k].score_range && (
                <span className="ml-auto rounded-full bg-[var(--border-soft)] px-2 py-0.5 text-xs tabular-nums">
                  分數 {fmt(g[k].score_range![0], 0)}–{fmt(g[k].score_range![1], 0)}
                </span>
              )}
            </div>
            <ol className="flex flex-col gap-2 text-sm">
              {g[k].representatives.map((r) => (
                <li key={r.post_id} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <a href={r.post_url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 hover:underline">
                      {r.text || "（無文字內容）"}
                    </a>
                    <span className="text-xs text-[var(--chart-muted)]">
                      按讚 {fmt(r.likes, 0)}・回覆 {fmt(r.replies, 0)}
                    </span>
                  </div>
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums"
                    style={{ background: `color-mix(in srgb, ${GROUP_COLOR[k]} 22%, transparent)` }}
                    title="互動分數"
                  >
                    {fmt(r.score, 0)}
                  </span>
                </li>
              ))}
            </ol>
            {g[k].top_terms.length > 0 && (
              <p className="text-xs text-[var(--chart-ink-2)]">特徵詞：{g[k].top_terms.slice(0, 6).map((t) => t.term).join("、")}</p>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-surface">
        <table className="w-full min-w-[480px] text-left text-sm" data-testid="group-features">
          <caption className="px-3 pt-3 text-left text-xs text-[var(--chart-muted)]">各組代表貼文的文字特徵（同一套方法）</caption>
          <thead className="text-[var(--chart-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">特徵</th>
              {GROUP_ORDER.map((k) => (
                <th key={k} className="px-3 py-2 text-right font-medium">
                  <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: GROUP_COLOR[k] }} aria-hidden />
                  {g[k].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureKeys.map((f) => (
              <tr key={f} className="border-t border-[var(--chart-grid)]">
                <td className="px-3 py-1.5">{FEATURE_LABEL[f] ?? f}</td>
                {GROUP_ORDER.map((k) => (
                  <td key={k} className="px-3 py-1.5 text-right tabular-nums">
                    {formatFeature(f, g[k].features[f])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {groups.comparison && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FactorList title="成功因素（高互動組較明顯）" items={groups.comparison.success_factors} />
          <FactorList title="失敗因素（低互動組較明顯）" items={groups.comparison.failure_factors} />
        </div>
      )}
      <p className="text-xs text-[var(--chart-muted)]">依互動分數均分三組，比較各組的用詞與寫法。</p>
    </div>
  );
}

function FactorList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-surface p-4">
      <h3 className="mb-2 font-medium">{title}</h3>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--chart-muted)]">差異不明顯</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 建議

const PRIORITY_STYLE: Record<Insight["priority"], string> = {
  P1: "bg-accent text-accent-ink",
  P2: "bg-[color-mix(in_srgb,var(--cmp-1)_15%,transparent)] text-[var(--cmp-1)]",
  P3: "bg-[var(--border-soft)] text-muted",
};

/** 優先級的白話說明：卡片上顯示短標籤，滑過顯示完整定義。 */
const PRIORITY_TEXT: Record<Insight["priority"], { short: string; long: string }> = {
  P1: { short: "優先執行", long: "證據充分、容易執行，建議先做" },
  P2: { short: "小規模試驗", long: "先用少量貼文測試" },
  P3: { short: "探索", long: "貼文數少，僅供參考" },
};

const FIELD_ICON: Record<string, string> = {
  "觀察（數據）": "M4 19V9m6 10V5m6 14v-7",
  推測: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z",
  建議: "M5 12h14m-6-6 6 6-6 6",
  驗證方法: "m5 12 4 4 10-10",
};

function InsightsView({ insights, generator }: { insights: Insight[]; generator: string }) {
  const fromLlm = generator.startsWith("groq:");
  return (
    <div className="flex flex-col gap-3" data-testid="insights">
      <p className="text-sm text-[var(--chart-ink-2)]" data-testid="insight-source">
        {fromLlm ? "由 AI 產生，僅供參考。" : "依內建規則產生。"}
      </p>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {insights.map((it, i) => (
          <li
            key={i}
            className={`flex flex-col gap-2.5 rounded-xl border bg-surface p-4 text-sm ${
              it.priority === "P1" ? "border-l-[3px] border-accent/50 border-l-accent" : "border-[var(--border-soft)]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium">{it.title}</h3>
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLE[it.priority]}`}
                  title={`${PRIORITY_TEXT[it.priority].long}；建議執行並觀察 ${it.timeline}`}
                >
                  {PRIORITY_TEXT[it.priority].short}・觀察 {it.timeline}
                </span>
                <CopyButton
                  text={[it.title, `觀察：${it.observation}`, `推測：${it.hypothesis}`, `建議：${it.action}`, `驗證：${it.validation}`].join("\n")}
                />
              </span>
            </div>
            <Field label="觀察（數據）" text={it.observation} />
            <Field label="推測" text={it.hypothesis} />
            <Field label="建議" text={it.action} />
            <Field label="驗證方法" text={it.validation} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex gap-2">
      <svg
        viewBox="0 0 24 24"
        className="mt-0.5 size-4 shrink-0 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={FIELD_ICON[label]} />
      </svg>
      <p>
        <span className="mr-1 text-xs text-[var(--chart-muted)]">{label}</span>
        {text}
      </p>
    </div>
  );
}
