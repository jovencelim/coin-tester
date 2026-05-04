export default function Panel({ title, children }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 shadow-lg">
      <h2 className="text-sm text-slate-400 mb-2">{title}</h2>
      {children}
    </div>
  );
}