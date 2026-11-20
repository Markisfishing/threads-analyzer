"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmt, type Summary } from "@/lib/report";

const AXIS = { stroke: "var(--chart-axis)", tick: { fill: "var(--chart-muted)", fontSize: 12 } };
const TOOLTIP_STYLE = {
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
    <figure className="flex min-w-0 flex-col gap-3 rounded-xl border border-foreground/10 bg-surface p-4" data-testid={testId}>
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{title}</h3>
          {subtitle && <p className="text-sm text-[var(--chart-ink-2)]">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="rounded-full border border-foreground/20 px-3 py-1 text-xs"
          aria-pressed={showTable}
        >
          {showTable ? "顯示圖表" : "表格檢視"}
        </button>
      </figcaption>
      {showTable ? <div className="overflow-x-auto text-sm">{table}</div> : children}
    </figure>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
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
                      outline: hover?.w === w && hover?.h === h ? "2px solid var(--chart-ink)" : undefined,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="min-h-5 text-sm text-[var(--chart-ink-2)]" aria-live="polite">
        {hover
          ? `週${WD[hover.w]} ${hover.h}:00–${hover.h + 1}:00：${hovered?.count ?? 0} 篇` +
            (hovered?.avg_engagement != null ? `，平均互動 ${fmt(hovered.avg_engagement)}` : "")
          : "顏色越深代表該時段發文越多；滑過格子查看數字。"}
      </p>
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
              fill="var(--series-1)"
              radius={[0, 4, 4, 0]}
              barSize={18}
              label={{ position: "right", fill: "var(--chart-ink-2)", fontSize: 12, formatter: (v: unknown) => fmt(Number(v), 0) }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ------------------------------------------------------------------ 3. 文字長度 vs 互動

export function LengthChart({ length }: { length: Summary["length"] }) {
  const normal = length.points.filter((p) => !p.is_outlier);
  const outliers = length.points.filter((p) => p.is_outlier);
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
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(Number(v), 0)} />
            <Scatter name="貼文" data={normal} fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth={2} />
            {outliers.length > 0 && (
              <Scatter name="異常值" data={outliers} fill="var(--chart-surface)" stroke="var(--series-1)" strokeWidth={2} />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {outliers.length > 0 && (
        <p className="text-xs text-[var(--chart-muted)]">空心點為異常值（IQR 法，共 {outliers.length} 篇）</p>
      )}
    </ChartCard>
  );
}

// ------------------------------------------------------------------ 4. 常見關鍵字

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
            <Bar dataKey="posts" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={14} />
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
