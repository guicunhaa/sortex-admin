// src/components/SalesPie.tsx
'use client';

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';

const colors = [
  '#2563eb', '#4f46e5', '#6366f1',
  '#7c3aed', '#8b5cf6', '#a855f7',
];

interface Slice { name: string; value: number }
export default function SalesPie({ data }: { data: Slice[] }) {
  if (!data.length) return <p>Nenhum dado.</p>;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}