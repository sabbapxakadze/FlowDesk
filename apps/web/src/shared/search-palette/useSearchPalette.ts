import { useContext } from "react";
import { SearchPaletteContext, type SearchPaletteContextValue } from "./search-palette-context";

export function useSearchPalette(): SearchPaletteContextValue {
  const ctx = useContext(SearchPaletteContext);
  if (!ctx) {
    throw new Error("useSearchPalette must be used within SearchPaletteProvider");
  }
  return ctx;
}
