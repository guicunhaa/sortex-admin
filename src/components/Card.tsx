// components/Card.tsx
import { ReactNode } from 'react';

export default function Card({
  title, children,
}: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white shadow p-4 flex flex-col gap-2">
      <span className="text-sm text-gray-500">{title}</span>
      {children}
    </div>
  );
}