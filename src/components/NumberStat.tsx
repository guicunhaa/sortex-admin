// src/components/NumberStat.tsx
interface Props {
  label: string;
  value: string | number;
}

export default function NumberStat({ label, value }: Props) {
  return (
    <div className="bg-white shadow rounded p-4 flex flex-col gap-2">
      <span className="text-sm text-gray-500">{label}</span>
      <strong className="text-2xl font-semibold">{value}</strong>
    </div>
  );
}