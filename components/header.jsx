"use client";

import Link from "next/link";
import { Mountain } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export default function Header({ active }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-card">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-4 py-2.5">
        <Link
          className="flex items-center gap-2.5 text-[17px] font-bold text-foreground no-underline"
          href="/"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#1a73e8] text-white">
            <Mountain size={20} />
          </span>
          <span>長青健行社</span>
          <small className="text-[13px] font-normal text-muted-foreground">
            vanhiking
          </small>
        </Link>
        <nav className="flex items-center gap-1" aria-label="主要分區">
          <Button
            variant={active === "map" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href="/">健行地圖</Link>
          </Button>
          <Button
            variant={active === "dashboard" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href="/dashboard">數據</Link>
          </Button>
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}
