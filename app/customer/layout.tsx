import type { ReactNode } from "react";
import { requireCustomerPortalUser } from "@/lib/portal-access";

export default async function CustomerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireCustomerPortalUser();

  return <>{children}</>;
}
