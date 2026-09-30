import { createContext } from "react";

export type SearchPaletteContextValue = {
  isOpen: boolean;
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void;
};

/**
 * Whether the search popup (the command palette) is open. It lives here, not
 * inside the palette, because the sidebar's Search button has to open it and a
 * widget may not import another widget. Same file split as auth: the context
 * object here, the provider component and the hook in their own files.
 */
export const SearchPaletteContext = createContext<SearchPaletteContextValue | null>(null);
