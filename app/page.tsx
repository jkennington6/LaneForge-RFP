import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import {
  ArrowRight,
  FileSpreadsheet,
  LockKeyhole,
  Route,
  Upload,
} from "lucide-react";

const features = [
  {
    icon: FileSpreadsheet,
    title: "RFP bid events",
    text: "Create customer RFPs, invite carriers, collect responses, and manage deadlines.",
  },
  {
    icon: Upload,
    title: "Shipment and bid uploads",
    text: "Support CSV/XLSX uploads, validations, bid templates, and carrier response parsing.",
  },
  {
    icon: Route,
    title: "Routing guides",
    text: "Rank primary and backup carriers by lane, origin, state pair, or ZIP3 lane.",
  },
  {
    icon: LockKeyhole,
    title: "SaaS access control",
    text: "Invite-only users, tenant isolation, owner-protected account, and instant suspension design.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-4xl">
          <img
            src="/brand/laneforge-logo.png"
            alt="LaneForge RFP"
            className="mb-10 h-auto w-full max-w-3xl object-contain"
          />

          <div className="mb-8 inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-slate-200">
            Customer and carrier-facing freight RFP SaaS
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Build, manage, compare, and award LTL/FTL RFPs from one secure
            platform.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            LaneForge is a SaaS foundation for 3PLs, shippers, and carriers. It
            is designed around multi-tenant security, bid uploads, comparison
            logic, and routing guide outputs from day one.
          </p>

          <div className="mt-8">
            <Show when="signed-in">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/portal"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-slate-950"
                >
                  Open portal <ArrowRight className="h-4 w-4" />
                </Link>
                <UserButton />
              </div>
            </Show>

            <Show when="signed-out">
              <div className="flex flex-wrap items-center gap-3">
                <SignInButton mode="modal">
                  <button className="rounded-xl bg-white px-5 py-3 font-semibold text-slate-950">
                    Sign in
                  </button>
                </SignInButton>
              </div>
            </Show>
          </div>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <Icon className="h-6 w-6 text-orange-300" />
                <h2 className="mt-4 font-semibold">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {feature.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
