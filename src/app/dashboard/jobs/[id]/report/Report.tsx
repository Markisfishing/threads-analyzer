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

/** 分析報告（PRD F7）：總覽、Top posts、圖表、三群組、策略建議、資料限制。 */
export function Report({ result }: { result: AnalysisResult }) {
  const { summary } = result;
  return (
    <div className="flex flex-col gap-10" data-testid="report">
      <OverviewCards ov={summary.overview} />

      <Section title="Top 5 貼文" note={result.top_posts.sort_by === "engagement_rate" ? "依互動率排序" : "粉絲數無法取得，依總互動排序"}>
        <TopPostsTable items={result.top_posts.items} byRate={result.top_posts.sort_by === "engagement_rate"} />
      </Section>

      <Section title="互動分析">
        <div className="chart-grid grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <TimeHeatmap time={summary.time} />
          </div>
          <TimeEngagementChart time={summary.time} />
          <TypeChart types={summary.types} />
          <LengthChart length={summary.length} />
          <KeywordChart keywords={summary.keywords} />
        </div>
      </Section>

      {result.groups && (
        <Section title="高／中／低互動群組分析" note="互動分數 = 按讚 + 2 × 回覆">
          <GroupsView groups={result.groups} />
        </Section>
      )}

      <Section title="內容策略建議">
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

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex animate-fade-up flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <span className="text-sm text-[var(--chart-muted)]">{note}</span>}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ 總覽

function OverviewCards({ ov }: { ov: Overview }) {
  const cards: { label: string; value: string; sub?: string }[] = [
    { label: "貼文數", value: fmt(ov.post_count, 0), sub: ov.first_post_at ? `${formatTaipei(ov.first_post_at).slice(0, 10)} 起` : undefined },
    { label: "粉絲數", value: compact(ov.follower_count) },
    { label: "平均按讚", value: fmt(ov.likes.mean, 0), sub: `中位數 ${fmt(ov.likes.median, 0)}` },
    { label: "平均回覆", value: fmt(ov.replies.mean, 0), sub: `中位數 ${fmt(ov.replies.median, 0)}` },
    { label: "平均轉發", value: fmt(ov.reposts.mean, 0), sub: `引用 ${fmt(ov.quotes.mean, 0)}` },
    {
      label: "平均互動率",
      value: ov.engagement_rate_pct.mean != null ? `${fmt(ov.engagement_rate_pct.mean, 2)}%` : "—",
      sub: ov.engagement_rate_pct.median != null ? `中位數 ${fmt(ov.engagement_rate_pct.median, 2)}%` : "無粉絲數",
    },
    { label: "每週發文", value: ov.posts_per_week != null ? `${fmt(ov.posts_per_week)} 篇` : "—" },
    {
      label: "平均總互動",
      value: fmt(ov.engagement.mean, 0),
      sub: ov.outlier_count ? `排除 ${ov.outlier_count} 篇異常值：${fmt(ov.engagement_excl_outliers.mean, 0)}` : `中位數 ${fmt(ov.engagement.median, 0)}`,
    },
  ];
  return (
    <dl className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="overview">
      {cards.map((c, i) => (
        <div
          key={c.label}
          style={{ "--i": i } as React.CSSProperties}
          className="lift rounded-xl border border-foreground/10 bg-surface p-3"
        >
          <dt className="text-xs text-[var(--chart-ink-2)]">{c.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            <CountUp value={c.value} />
          </dd>
          {c.sub && <dd className="text-xs text-[var(--chart-muted)]">{c.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ Top posts

function TopPostsTable({ items, byRate }: { items: TopPost[]; byRate: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-foreground/10 bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm" data-testid="top-posts">
        <thead className="text-[var(--chart-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">內容</th>
            <th className="px-3 py-2 font-medium">發文時間</th>
            <th className="px-3 py-2 text-right font-medium">按讚</th>
            <th className="px-3 py-2 text-right font-medium">回覆</th>
            <th className="px-3 py-2 text-right font-medium">轉發</th>
            <th className="px-3 py-2 text-right font-medium">{byRate ? "互動率" : "總互動"}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={p.post_id} className="border-t border-[var(--chart-grid)] align-top">
              <td className="px-3 py-2 tabular-nums">{i + 1}</td>
              <td className="max-w-md px-3 py-2">
                <a href={p.post_url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 hover:underline">
                  {p.text || "（無文字內容）"}
                </a>
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--chart-ink-2)]">{formatTaipei(p.published_at)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(p.likes, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(p.replies, 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt((p.reposts ?? 0) + (p.quotes ?? 0), 0)}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {byRate ? `${fmt(p.engagement_rate_pct, 2)}%` : fmt(p.engagement, 0)}
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
const GROUP_COLOR: Record<GroupKey, string> = { high: "var(--series-1)", mid: "var(--series-2)", low: "var(--series-3)" };

function GroupsView({ groups }: { groups: Groups }) {
  if (groups.skipped || !groups.groups) {
    return <p className="text-sm text-[var(--chart-ink-2)]" data-testid="groups-skipped">{groups.reason}</p>;
  }
  const g = groups.groups;
  const featureKeys = Object.keys(g.high.features);
  return (
    <div className="flex flex-col gap-4" data-testid="groups">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {GROUP_ORDER.map((k) => (
          <div key={k} className="flex flex-col gap-3 rounded-xl border border-foreground/10 bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: GROUP_COLOR[k] }} aria-hidden />
              <h3 className="font-medium">{g[k].label}</h3>
              <span className="text-sm text-[var(--chart-muted)]">
                {g[k].size} 篇{g[k].score_range && `・分數 ${fmt(g[k].score_range![0], 0)}–${fmt(g[k].score_range![1], 0)}`}
              </span>
            </div>
            <ol className="flex flex-col gap-2 text-sm">
              {g[k].representatives.map((r) => (
                <li key={r.post_id} className="border-l-2 pl-2" style={{ borderColor: GROUP_COLOR[k] }}>
                  <a href={r.post_url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 hover:underline">
                    {r.text || "（無文字內容）"}
                  </a>
                  <span className="text-xs text-[var(--chart-muted)]">
                    按讚 {fmt(r.likes, 0)}・回覆 {fmt(r.replies, 0)}・分數 {fmt(r.score, 0)}
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

      <div className="overflow-x-auto rounded-xl border border-foreground/10 bg-surface">
        <table className="w-full min-w-[480px] text-left text-sm" data-testid="group-features">
          <caption className="px-3 pt-3 text-left text-xs text-[var(--chart-muted)]">各組代表貼文的文字特徵（同一套方法）</caption>
          <thead className="text-[var(--chart-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">特徵</th>
              {GROUP_ORDER.map((k) => (
                <th key={k} className="px-3 py-2 text-right font-medium">{g[k].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureKeys.map((f) => (
              <tr key={f} className="border-t border-[var(--chart-grid)]">
                <td className="px-3 py-1.5">{FEATURE_LABEL[f] ?? f}</td>
                {GROUP_ORDER.map((k) => (
                  <td key={k} className="px-3 py-1.5 text-right tabular-nums">{formatFeature(f, g[k].features[f])}</td>
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
      <p className="text-xs text-[var(--chart-muted)]">
        方法：{groups.method.grouping}；{groups.method.representatives}；{groups.method.nlp}。
      </p>
    </div>
  );
}

function FactorList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-surface p-4">
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

function InsightsView({ insights, generator }: { insights: Insight[]; generator: string }) {
  const fromLlm = generator.startsWith("groq:");
  return (
    <div className="flex flex-col gap-3" data-testid="insights">
      <p className="text-sm text-[var(--chart-ink-2)]" data-testid="insight-source">
        {fromLlm ? `AI 產生（Groq ${generator.slice(5)}）。AI 建議僅供參考，請以驗證方法確認。` : "規則模板產生。"}
      </p>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {insights.map((it, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-foreground/10 bg-surface p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium">{it.title}</h3>
              <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-xs">
                {it.priority}・{it.timeline}
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
    <p>
      <span className="mr-1 text-xs text-[var(--chart-muted)]">{label}</span>
      {text}
    </p>
  );
}
