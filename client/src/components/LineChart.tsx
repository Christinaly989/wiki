import { useEffect, useRef } from "react"
import { LineChart as EchartsLineChart } from "echarts/charts"
import { GridComponent, TooltipComponent } from "echarts/components"
import { init, use } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"
import type { Metric } from "../types"

use([EchartsLineChart, GridComponent, TooltipComponent, CanvasRenderer])

function chartColor(metric: Metric) {
  if (metric.group === "inflationFed") {
    return "#c24f2c"
  }
  if (metric.group === "ratesFinancial") {
    return "#154f87"
  }
  return "#116b5f"
}

export function LineChart({ metric }: { metric: Metric }) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    let chart: { resize: () => void; dispose: () => void; setOption: (option: object) => void } | null = null
    const resizeObserver = new ResizeObserver(() => chart?.resize())
    if (!containerRef.current) {
      return
    }

    chart = init(containerRef.current)
    resizeObserver.observe(containerRef.current)

    chart.setOption({
      animationDuration: 500,
      grid: { top: 10, right: 12, bottom: 26, left: 36 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0f1d2b",
        borderWidth: 0,
        textStyle: { color: "#f8efe4" },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#6d7f8f" } },
        axisLabel: {
          color: "#556877",
          formatter: (value: string) => value.slice(2),
        },
        data: metric.history.map((point) => point.date),
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#556877" },
        splitLine: { lineStyle: { color: "rgba(39, 67, 89, 0.12)" } },
      },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "none",
          data: metric.history.map((point) => point.value),
          lineStyle: {
            width: 2.5,
            color: chartColor(metric),
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${chartColor(metric)}88` },
                { offset: 1, color: `${chartColor(metric)}08` },
              ],
            },
          },
        },
      ],
    })

    return () => {
      resizeObserver.disconnect()
      chart?.dispose()
    }
  }, [metric])

  return <div className="chart-shell" ref={containerRef} />
}
