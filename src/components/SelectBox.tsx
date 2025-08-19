// src/components/SelectBox.tsx
'use client';

interface Option<T = string> {
  label: string;
  value: T;
}

interface Props<T = string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}

export default function SelectBox<T = string>({
  label,
  value,
  options,
  onChange,
}: Props<T>) {
  return (
    <label className="text-sm text-gray-600 flex flex-col gap-1">
      {label}
      <select
        className="h-9 rounded border px-2 bg-white"
        value={value as any}
        onChange={(e) => onChange(e.target.value as unknown as T)}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value as any}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}