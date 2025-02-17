"use client";

import { Search, X } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}

export function SearchBox({ value, onChange, autoFocus }: SearchBoxProps) {
  return (
    <InputGroup className="h-11 rounded-full bg-card shadow-md">
      <InputGroupAddon align="inline-start">
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜尋路線、地點、集合點…"
        aria-label="搜尋路線"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            onClick={() => onChange("")}
            aria-label="清除搜尋"
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
