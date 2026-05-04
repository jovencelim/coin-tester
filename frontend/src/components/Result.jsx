export default function Result({ data }) {
  if (!data) {
    return <p className="text-center text-slate-500">No result yet</p>;
  }

  const isReal = data.result === "GENUINE";

  return (
    <div className="flex flex-col items-center gap-4">
      <h1
        className={`text-3xl font-bold ${
          isReal ? "text-green-400" : "text-red-400"
        }`}
      >
        {data.result}
      </h1>

      <div className="grid grid-cols-3 gap-4">
        <Metric label="f₀" value={`${data.f0.toFixed(2)} Hz`} />
        <Metric label="α" value={data.alpha.toFixed(4)} />
        <Metric label="Q" value={data.Q.toFixed(2)} />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-slate-700 p-3 rounded-lg text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}