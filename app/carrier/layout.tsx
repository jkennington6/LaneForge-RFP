import type { ReactNode } from "react";
import { requireCarrierPortalUser } from "@/lib/portal-access";

export default async function CarrierLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireCarrierPortalUser();

  return <>{children}</>;
}
