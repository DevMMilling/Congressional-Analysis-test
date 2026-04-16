import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const defaultSeries = [
  { key: "portfolio", color: "#0f766e", name: "Portfolio" },
  { key: "benchmark", color: "#c2410c", name: "Benchmark" },
];

export default function SimpleLineChart({ data, series = defaultSeries, markers = [], xKey = "date", height = 320 }) {
  const visibleMarkers = markers.filter((marker) => marker && marker.date !== null && marker.date !== undefined && marker.price !== null && marker.price !== undefined);

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
          <XAxis dataKey={xKey} stroke="#5f5348" />
          <YAxis stroke="#5f5348" />
          <Tooltip />
          {series.map((line) => (
            <Line key={line.key} dataKey={line.key} name={line.name || line.key} stroke={line.color} strokeWidth={line.width || 3} dot={false} />
          ))}
          {visibleMarkers.map((marker) => (
            <ReferenceDot
              key={marker.id ?? `${marker.date}-${marker.label}`}
              x={marker.date}
              y={marker.price}
              r={5}
              fill={marker.color || "#b91c1c"}
              stroke="#fff7ed"
              strokeWidth={2}
              isFront
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
