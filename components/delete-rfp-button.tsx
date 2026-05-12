"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DeleteRfpButtonProps = {
  rfpId: string;
  redirectTo?: string;
};

export function DeleteRfpButton({
  rfpId,
  redirectTo = "/rfps",
}: DeleteRfpButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete this RFP? It will be hidden from normal views, but bid history will be preserved."
    );

    if (!confirmed) return;

    setIsDeleting(true);

    const response = await fetch(`/api/rfps/${rfpId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error ?? "Unable to delete RFP.");
      setIsDeleting(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isDeleting ? "Deleting..." : "Delete RFP"}
    </button>
  );
}
