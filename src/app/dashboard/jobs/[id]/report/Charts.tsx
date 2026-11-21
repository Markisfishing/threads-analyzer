"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmt, type Summary } from "@/lib/report";

export const AXIS = { stroke: "var(--chart-axis)", tick: { fill: "var(--chart-muted)", fontSize: 12 } };
/** 滑過或選取中的資料點改用 --chart-highlight（藍），與「最佳」的青綠區分。 */
export const ACTIVE_BAR = { fill: "var(--chart-highlight)" };

/** 長條配色規則：最大值（或指定的最佳項）用強調色，其餘灰藍，讓重點一眼可見。 */
export function bestCells<T>(data: T[], value: (d: T) => number | null | undefined, isBest?: (d: T) => boolean) {
  const max = Math.max(...data.map((d) => value(d) ?? -Infinity));
  return data.map((d, i) => {
    const best = isBest ? isBest(d) : (value(d) ?? -Infinity) === max && max > 0;
    return <Cell key={i} fill={best ? "var(--chart-best)" : "var(--chart-bar)"} />;
  });
}

export const TOOLTIP_STYLE = {
  background: "var(--chart-surface)",
  border: "1px solid var(--chart-grid)",
  borderRadius: 8,
  color: "var(--chart-ink)",
  fontSize: 13,
};

/** 圖表外框：標題、說明、圖表本體，以及可展開的表格檢視（無障礙）。 */
export function ChartCard({
  title,
  subtitle,
  children,
  table,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  table: React.ReactNode;
  testId?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-soft)] bg-surface p-4" data-testid={testId}>
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{title}</h3>
          {subtitle && <p className="text-sm text-[var(--chart-ink-2)]">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--border-soft)]"
          aria-pressed={showTable}
        >
          {showTable ? "顯示圖表" : "表格檢視"}
        </button>
      </figcaption>
      {showTable ? <div className="overflow-x-auto text-sm">{table}</div> : children}
    </figure>
  );
}

export function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left">
      <thead className="text-[var(--chart-muted)]">
        <tr>
          {head.map((h) => (
            <th key={h} className="py-1 pr-4 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-[var(--chart-grid)]">
            {r.map((c, j) => (
              <td key={j} className="py-1 pr-4 tabular-nums">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ 1. 發文時段熱度圖

const WD = ["一", "二", "三", "四", "五", "六", "日"];
const SEQ = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6"];

export function TimeHeatmap({ time }: { time: Summary["time"] }) {
  const [hover, setHover] = useState<{ w: number; h: number } | null>(null);
  const cells = new Map(time.heatmap.map((c) => [`${c.weekday}-${c.hour}`, c]));
  const max = Math.max(1, ...time.heatmap.map((c) => c.count));
  const hovered = hover ? cells.get(`${hover.w}-${hover.h}`) : undefined;
  // 平均互動最高、且至少 2 篇的格子用強調色外框標出
  const best = time.heatmap
    .filter((c) => c.count >= 2 && c.avg_engagement != null)
    .sort((a, b) => b.avg_engagement! - a.avg_engagement!)[0];

  const subtitle = [
    time.most_posted_weekday && `最常在${time.most_posted_weekday.label}發文`,
    time.most_posted_hour && `最常在 ${time.most_posted_hour.hour}:00 發文`,
  ]
    .filter(Boolean)
    .join("、");

  return (
    <ChartCard
      title="發文時段分布（台北時間）"
      subtitle={subtitle || undefined}
      testId="chart-heatmap"
      table={
        <SimpleTable
          head={["星期", "發文數", "平均互動"]}
          rows={time.weekday.map((w) => [w.label, w.count, fmt(w.avg_engagement)])}
        />
      }
    >
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] gap-[2px]" style={{ gridTemplateColumns: "2rem repeat(24, minmax(0, 1fr))" }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[10px] text-[var(--chart-muted)]">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {WD.map((label, w) => (
            <div key={w} className="contents">
              <div className="pr-1 text-right text-xs leading-6 text-[var(--chart-muted)]">{label}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const c = cells.get(`${w}-${h}`);
                const level = c ? Math.min(SEQ.length - 1, Math.floor(((c.count - 1) / max) * SEQ.length)) : -1;
                return (
                  <div
                    key={h}
                    role="img"
                    aria-label={`週${label} ${h}:00，${c?.count ?? 0} 篇`}
                    onMouseEnter={() => setHover({ w, h })}
                    onMouseLeave={() => setHover(null)}
                    className="h-6 rounded-[3px]"
                    style={{
                      background: c ? `var(${SEQ[level]})` : "var(--seq-0)",
                      outline:
                        hover?.w === w && hover?.h === h
                          ? "2px solid var(--chart-highlight)"
                          : best && best.weekday === w && best.hour === h
                            ? "2px solid var(--chart-best)"
                            : undefined,
                      outlineOffset: 1,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-h-5 text-sm text-[var(--chart-ink-2)]" aria-live="polite">
          {hover
            ? `週${WD[hover.w]} ${hover.h}:00–${hover.h + 1}:00：${hovered?.count ?? 0} 篇` +
              (hovered?.avg_engagement != null ? `，平均互動 ${fmt(hovered.avg_engagement)}` : "")
            : best
              ? `色塊越飽和＝發文越多；青綠框＝平均互動最高（週${WD[best.weekday]} ${best.hour}:00，${fmt(best.avg_engagement)}）`
              : "色塊越飽和＝發文越多；滑過格子查看數字。"}
        </p>
        <div className="flex items-center gap-1 text-xs text-[var(--chart-muted)]" data-testid="heatmap-legend">
          少
          {["--seq-0", ...SEQ].map((v) => (
            <span key={v} className="size-3 rounded-[2px]" style={{ background: `var(${v})` }} aria-hidden />
          ))}
          多（最多 {max} 篇）
        </div>
      </div>
    </ChartCard>
  );
}

// ------------------------------------------------------------------ 2. 貼文類型平均互動

export function TypeChart({ types }: { types: Summary["types"] }) {
  const data = types.map((t) => ({ ...t, avg: t.avg_engagement ?? 0 }));
  return (
    <ChartCard
      title="貼文類型與平均互動"
      subtitle="同一篇可同時屬於多種類型"
      testId="chart-types"
      table={
        <SimpleTable
          head={["類型", "篇數", "占比", "平均互動"]}
          rows={types.map((t) => [t.type, t.count, `${Math.round(t.share * 100)}%`, fmt(t.avg_engagement)])}
        />
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" {...AXIS} tickFormatter={(v) => fmt(v, 0)} />
            <YAxis type="category" dataKey="type" width={84} {...AXIS} />
            <Tooltip
              cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, _n, item) => [`${fmt(Number(v))}（${item.payload.count} 篇）`, "平均互動"]}
            />
            <Bar
              dataKey="avg"
              fill="var(--chart-bar)"
              activeBar={ACTIVE_BAR}
              radius={[0, 4, 4, 0]}
              barSize={18}
              label={{
                position: "right",
                fill: "var(--chart-ink-2)",
                fontSize: 12,
                formatter: (v: unknown) => (Number(v) === 0 ? "0（無資料）" : fmt(Number(v), 0)),
              }}
            >
              {bestCells(data, (d) => (d.count > 0 ? d.avg : null))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ------------------------------------------------------------------ 3. 文字長度 vs 互動

/** 最小平方法趨勢線（排除異常值），點太少就不畫。 */
function trendLine(pts: { char_count: number; engagement: number }[]) {
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.char_count, 0) / n;
  const my = pts.reduce((s, p) => s + p.engagement, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.char_count - mx) ** 2, 0);
  if (!sxx) return null;
  const k = pts.reduce((s, p) => s + (p.char_count - mx) * (p.engagement - my), 0) / sxx;
  const xs = pts.map((p) => p.char_count);
  const [x1, x2] = [Math.min(...xs), Math.max(...xs)];
  return [
    { x: x1, y: Math.max(0, my + k * (x1 - mx)) },
    { x: x2, y: Math.max(0, my + k * (x2 - mx)) },
  ] as const;
}

type LengthPoint = Summary["length"]["points"][number];

export function LengthChart({ length, texts = {} }: { length: Summary["length"]; texts?: Record<string, string> }) {
  const normal = length.points.filter((p) => !p.is_outlier);
  const outliers = length.points.filter((p) => p.is_outlier);
  const trend = trendLine(normal);
  return (
    <ChartCard
      title="文字長度與互動"
      subtitle={
        length.spearman != null
          ? `Spearman 相關係數 ${length.spearman}（${Math.abs(length.spearman) < 0.2 ? "幾乎無關" : length.spearman > 0 ? "正相關" : "負相關"}）`
          : undefined
      }
      testId="chart-length"
      table={
        <SimpleTable
          head={["字數區間", "篇數", "平均互動"]}
          rows={length.bins.map((b) => [b.label, b.count, fmt(b.avg_engagement)])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 16 }}>
            <CartesianGrid stroke="var(--chart-grid)" />
            <XAxis type="number" dataKey="char_count" name="字數" {...AXIS}
              label={{ value: "字數", position: "insideBottom", offset: -8, fill: "var(--chart-muted)", fontSize: 12 }} />
            <YAxis type="number" dataKey="engagement" name="總互動" {...AXIS} tickFormatter={(v) => fmt(v, 0)} width={56} />
            <ZAxis range={[64, 64]} />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const pt = active ? (payload?.[0]?.payload as LengthPoint | undefined) : undefined;
                if (!pt) return null;
                const text = texts[pt.post_id];
                return (
                  <div style={TOOLTIP_STYLE} className="max-w-64 p-2" data-testid="length-tooltip">
                    <p className="tabular-nums">
                      {pt.char_count} 字・總互動 {fmt(pt.engagement, 0)}
                      {pt.is_outlier ? "（異常值）" : ""}
                    </p>
                    {text && <p className="mt-1 line-clamp-3 text-xs text-[var(--chart-ink-2)]">{text}</p>}
                  </div>
                );
              }}
            />
            {trend && (
              <ReferenceLine
                segment={trend}
                stroke="var(--chart-best)"
                strokeWidth={2}
                strokeDasharray="6 4"
                ifOverflow="extendDomain"
              />
            )}
            <Scatter
              name="貼文"
              data={normal}
              fill="var(--chart-bar)"
              stroke="var(--chart-surface)"
              strokeWidth={2}
              activeShape={{ fill: "var(--chart-highlight)", r: 7 }}
            />
            {outliers.length > 0 && (
              <Scatter
                name="異常值"
                data={outliers}
                fill="var(--chart-surface)"
                stroke="var(--chart-bar)"
                strokeWidth={2}
                activeShape={{ fill: "var(--chart-surface)", stroke: "var(--chart-highlight)", r: 7 }}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-[var(--chart-muted)]">
        {trend && "虛線為趨勢線（排除異常值）。"}
        {outliers.length > 0 && `空心點為異常值（IQR 法，共 ${outliers.length} 篇）。`}
        滑過點可預覽貼文。
      </p>
    </ChartCard>
  );
}

// ------------------------------------------------------------------ 4. 各時段平均互動

const MIN_POSTS_FOR_BEST = 2; // 只有 1 篇的時段平均值不穩定，不標為「最佳」

export function TimeEngagementChart({ time }: { time: Summary["time"] }) {
  const [by, setBy] = useState<"weekday" | "hour">("weekday");
  const data =
    by === "weekday"
      ? time.weekday.map((w) => ({ label: w.label, count: w.count, avg: w.avg_engagement }))
      : time.hour.map((h) => ({ label: `${h.hour}`, count: h.count, avg: h.avg_engagement }));
  const best = by === "weekday" ? time.best_weekday?.label : time.best_hour && `${time.best_hour.hour}:00`;
  const reliable = data.filter((d) => d.count >= MIN_POSTS_FOR_BEST).length;

  return (
    <ChartCard
      title="各時段平均互動"
      subtitle={best ? `平均互動最高：${best}（台北時間）` : "台北時間"}
      testId="chart-time-engagement"
      table={
        <SimpleTable
          head={[by === "weekday" ? "星期" : "小時", "發文數", "平均互動"]}
          rows={data.filter((d) => d.count > 0).map((d) => [by === "hour" ? `${d.label}:00` : d.label, d.count, fmt(d.avg)])}
        />
      }
    >
      <div className="flex gap-1 self-start rounded-full border border-foreground/15 p-0.5 text-xs" role="group" aria-label="統計單位">
        {(["weekday", "hour"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setBy(k)}
            aria-pressed={by === k}
            className={`rounded-full px-3 py-1 transition-colors ${by === k ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
          >
            {k === "weekday" ? "星期" : "小時"}
          </button>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" {...AXIS} interval={by === "hour" ? 2 : 0} />
            <YAxis {...AXIS} width={48} tickFormatter={(v) => fmt(v, 0)} />
            <Tooltip
              cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }}
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(l) => (by === "hour" ? `${l}:00–${Number(l) + 1}:00` : String(l))}
              formatter={(v, _n, item) =>
                item.payload.count ? [`${fmt(Number(v))}（${item.payload.count} 篇）`, "平均互動"] : ["沒有發文", ""]
              }
            />
            <Bar dataKey="avg" fill="var(--chart-bar)" activeBar={ACTIVE_BAR} radius={[4, 4, 0, 0]} maxBarSize={28}>
              {bestCells(data, (d) => d.avg, (d) => (by === "hour" ? `${d.label}:00` : d.label) === best)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {reliable < data.filter((d) => d.count > 0).length && (
        <p className="text-xs text-[var(--chart-muted)]">只有 1 篇的時段平均值波動大，解讀時請搭配發文數。</p>
      )}
    </ChartCard>
  );
}

// ------------------------------------------------------------------ 5. 常見關鍵字

export function KeywordChart({ keywords }: { keywords: Summary["keywords"] }) {
  const data = keywords.keywords.slice(0, 10);
  if (!data.length) return null;
  return (
    <ChartCard
      title="常見關鍵字"
      subtitle="出現在幾篇貼文中（已排除停用詞）"
      testId="chart-keywords"
      table={
        <SimpleTable
          head={["關鍵字", "篇數"]}
          rows={keywords.keywords.map((k) => [k.term, k.posts])}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" allowDecimals={false} {...AXIS} />
            <YAxis type="category" dataKey="term" width={96} {...AXIS} interval={0} />
            <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [`${v} 篇`, "出現"]} />
            <Bar dataKey="posts" fill="var(--chart-bar)" activeBar={ACTIVE_BAR} radius={[0, 4, 4, 0]} barSize={14}>
              {bestCells(data, (d) => d.posts)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {keywords.hashtags.length > 0 && (
        <p className="text-sm text-[var(--chart-ink-2)]">
          常用 hashtag：{keywords.hashtags.slice(0, 8).map((h) => `#${h.tag}（${h.count}）`).join("、")}
        </p>
      )}
    </ChartCard>
  );
}
