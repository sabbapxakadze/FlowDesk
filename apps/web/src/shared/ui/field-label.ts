import { createContext, useContext } from "react";

/**
 * The id of the text inside a `Field`'s label. A `Field`'s `<label>` wraps its control, so anything else inside it (such as the show/hide
 * button of a `PasswordInput`) would otherwise become part of the control's accessible name ("Password Show password"). A control that
 * holds more than an input reads this id and names itself by it (`aria-labelledby`), so its name is exactly the label's text.
 */
export const FieldLabelContext = createContext<string | undefined>(undefined);

export function useFieldLabelId(): string | undefined {
  return useContext(FieldLabelContext);
}
