"use client";

import Link from "next/link";
import { Mountain } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export default function Header({ active }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Mountain size={20} />
          </span>
          <span>長青健行社</span>
          <small>vanhiking</small>
        </Link>
        <nav className="top-nav" aria-label="主要分區">
          <Link href="/" className={active === "map" ? "active" : ""}>
            健行地圖
          </Link>
          <Link href="/dashboard" className={active === "dashboard" ? "active" : ""}>
            數據
          </Link>
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}
