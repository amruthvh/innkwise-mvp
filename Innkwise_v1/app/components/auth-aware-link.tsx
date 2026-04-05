"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { getStoredAuthToken } from "@/lib/auth-client";

type AuthAwareLinkProps = {
  hrefIfAuthed: string;
  hrefIfGuest: string;
  className?: string;
  children: ReactNode;
};

export function AuthAwareLink({
  hrefIfAuthed,
  hrefIfGuest,
  className,
  children
}: AuthAwareLinkProps) {
  const [href, setHref] = useState(hrefIfGuest);

  useEffect(() => {
    setHref(getStoredAuthToken() ? hrefIfAuthed : hrefIfGuest);
  }, [hrefIfAuthed, hrefIfGuest]);

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}