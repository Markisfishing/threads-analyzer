"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartCard, SimpleTable, TOOLTIP_STYLE } from "../jobs/[id]/report/Charts";

/** 類型占比分組長條圖：顏色跟著帳號（勾選順序），不跟排名。 */
export function CompareTypeChart({
  labels,
  data,
}: {
  labels: string[];
  data: { type: string; [series: string]: number | string }[];
}) {
  return (
    <ChartCard
      title="貼文類型占比"
      subtitle="各帳號貼文中屬於該類型的比例（%），同一篇可屬於多種類型"
      testId="chart-compare-types"
      table={
        <SimpleTable
          head={["類型", ...labels]}
          rows={data.map((d) => [d.type, ...labels.map((_, i) => `${d[`s${i}`]}%`)])}
        />
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="type" {...AXIS} interval={0} />
            <YAxis {...AXIS} width={40} unit="%" domain={[0, 100]} />
            <Tooltip
              cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [`${v}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--chart-ink-2)" }} iconType="circle" />
            {labels.map((label, i) => (
              <Bar
                key={label}
                dataKey={`s${i}`}
                name={label}
                fill={`var(--series-${i + 1})`}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
