"use client";

import * as React from "react";

// 1. import `HeroUIProvider` component
import { HeroUIProvider as HeroUIProviderComponent } from "@heroui/react";

export default function HeroUIProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // 2. Wrap HeroUIProvider at the root of your app
  return <HeroUIProviderComponent>{children}</HeroUIProviderComponent>;
}
