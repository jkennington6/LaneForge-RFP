import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-bold">Access blocked</h1>
        <p className="mt-4 text-slate-300">
          Your account does not currently have access to this area of LaneForge.
          Contact the Super Admin if you believe this is incorrect.
        </p>

        <Link
          href="/"
          className="mt-8 inline-flex rounded-xl bg-white px-5 py-3 font-semibold text-slate-950"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
