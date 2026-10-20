// Shown instantly while an admin page's server data loads, so navigation
// feels immediate instead of blank.
export default function AdminLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-5 py-7 sm:px-8 sm:py-8" aria-busy="true">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-8 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[118px]" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="skeleton h-[320px]" />
    </div>
  );
}
