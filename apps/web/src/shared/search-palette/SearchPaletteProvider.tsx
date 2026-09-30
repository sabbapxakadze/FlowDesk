import { useMemo, useState, type ReactNode } from "react";
import { SearchPaletteContext } from "./search-palette-context";

export function SearchPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(() => ({ isOpen, setOpen }), [isOpen]);
  return <SearchPaletteContext.Provider value={value}>{children}</SearchPaletteContext.Provider>;
}
