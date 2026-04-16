import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function SimpleBarChart({ data, xKey, yKey, color = "#d97706" }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
          <XAxis dataKey={xKey} stroke="#5f5348" />
          <YAxis stroke="#5f5348" />
          <Tooltip />
          <Bar dataKey={yKey} fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
