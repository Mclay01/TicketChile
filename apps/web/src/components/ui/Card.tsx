export default function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm border border-zinc-200">
      {children}
    </div>
  );
}