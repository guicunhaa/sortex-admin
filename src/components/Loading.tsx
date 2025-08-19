// components/Loading.tsx
export default function Loading() {
  return (
    <div className="w-full h-40 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"/>
    </div>
  );
}