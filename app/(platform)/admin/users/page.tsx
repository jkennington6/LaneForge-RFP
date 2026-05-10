import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { users } from "@/lib/demo-data";

export default function UsersPage() {
  return (
    <div>
      <SectionHeader title="Access Control" description="Owner-only platform view for user access, status, company membership, and immediate suspension controls." action={<button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Invite user</button>} />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Owner protection:</strong> the Platform Owner account must be seeded from PLATFORM_OWNER_EMAIL and blocked from role changes, deletion, or suspension from the UI.
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last Login</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((user) => (
              <tr key={user.email}>
                <td className="px-4 py-3"><div className="font-semibold text-slate-950">{user.name}</div><div className="text-xs text-slate-500">{user.email}</div></td>
                <td className="px-4 py-3 text-slate-600">{user.role}</td>
                <td className="px-4 py-3 text-slate-600">{user.company}</td>
                <td className="px-4 py-3"><StatusBadge variant={user.status === "Protected" ? "neutral" : user.status === "Suspended" ? "danger" : "active"}>{user.status}</StatusBadge></td>
                <td className="px-4 py-3 text-slate-600">{user.lastLogin}</td>
                <td className="px-4 py-3"><button disabled={user.status === "Protected"} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">{user.status === "Suspended" ? "Reactivate" : "Suspend"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
