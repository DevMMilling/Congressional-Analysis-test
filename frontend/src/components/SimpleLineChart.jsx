import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const defaultSeries = [
  { key: "portfolio", color: "#0f766e", name: "Portfolio" },
  { key: "benchmark", color: "#c2410c", name: "Benchmark" },
];

const TOOLTIP_STYLE = {
  contentStyle: { background: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3", fontSize: 12 },
  labelStyle: { color: "#7d8590" },
  itemStyle: { color: "#e6edf3" },
};

export default function SimpleLineChart({ data, series = defaultSeries, markers = [], xKey = "date", height = 320 }) {
  const visibleMarkers = markers.filter((marker) => marker && marker.date !== null && marker.date !== undefined && marker.price !== null && marker.price !== undefined);

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis dataKey={xKey} stroke="#7d8590" tick={{ fill: "#7d8590", fontSize: 11 }} />
          <YAxis stroke="#7d8590" tick={{ fill: "#7d8590", fontSize: 11 }} />
          <Tooltip {...TOOLTIP_STYLE} />
          {series.map((line) => (
            <Line key={line.key} dataKey={line.key} name={line.name || line.key} stroke={line.color} strokeWidth={line.width || 3} dot={false} />
          ))}
          {visibleMarkers.map((marker) => (
            <ReferenceDot
              key={marker.id ?? `${marker.date}-${marker.label}`}
              x={marker.date}
              y={marker.price}
              r={5}
              fill={marker.color || "#f85149"}
              stroke="#0d1117"
              strokeWidth={2}
              isFront
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
