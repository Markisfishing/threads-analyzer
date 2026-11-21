"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartCard, SimpleTable, TOOLTIP_STYLE } from "../jobs/[id]/report/Charts";

/**
 * 類型占比：橫向分組長條，每種類型一組、組內依勾選順序排列帳號，長條末端直接標百分比。
 * 顏色跟著帳號（勾選順序），不跟排名；圖例順序與長條順序一致。
 */
export function CompareTypeChart({
  labels,
  data,
}: {
  labels: string[];
  data: { type: string; [series: string]: number | string }[];
}) {
  const height = Math.max(220, data.length * (labels.length * 18 + 28) + 40);
  return (
    <ChartCard
      title="貼文類型占比"
      subtitle="各帳號貼文中屬於該類型的比例（%），同一篇可屬於多種類型"
      testId="chart-compare-types"
      table={
        <SimpleTable head={["類型", ...labels]} rows={data.map((d) => [d.type, ...labels.map((_, i) => `${d[`s${i}`]}%`)])} />
      }
    >
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--chart-ink-2)]" aria-label="圖例">
        {labels.map((l, i) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: `var(--cmp-${i + 1})` }} aria-hidden />
            {l}
          </li>
        ))}
      </ul>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 44, top: 4, bottom: 4 }} barGap={2} barCategoryGap={14}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" {...AXIS} unit="%" domain={[0, 100]} />
            <YAxis type="category" dataKey="type" width={84} {...AXIS} interval={0} />
            <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`${v}%`, name]} />
            {labels.map((label, i) => (
              <Bar
                key={label}
                dataKey={`s${i}`}
                name={label}
                fill={`var(--cmp-${i + 1})`}
                radius={[0, 4, 4, 0]}
                barSize={14}
                label={{ position: "right", fill: "var(--chart-ink-2)", fontSize: 11, formatter: (v: unknown) => `${v}%` }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
