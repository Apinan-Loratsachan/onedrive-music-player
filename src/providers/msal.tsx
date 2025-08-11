"use client";

import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "@/lib/msal";
import { ReactNode } from "react";

interface MsalProviderWrapperProps {
  children: ReactNode;
}

export default function MsalProviderWrapper({
  children,
}: MsalProviderWrapperProps) {
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
