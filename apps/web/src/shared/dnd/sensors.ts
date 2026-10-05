import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

// Module-level on purpose: dnd-kit rebuilds every sortable item's pointer `listeners` whenever the sensor OPTIONS
// change identity, and options written inline in a component are new objects on every render. During a drag the page
// renders on every drag-over event, so inline options re-rendered every card (2,000+ renders in one drag). With
// constants the listeners keep their identity and the memoised card bodies stay out of it.
const MOUSE_OPTIONS = { activationConstraint: { distance: 6 } };
const TOUCH_OPTIONS = { activationConstraint: { delay: 200, tolerance: 6 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

/**
 * The sensors the board and the sprints page drag with. Distance 6: a plain click stays under it and navigates via
 * the card's <Link>. Touch needs a short press so scrolling the page still works. The keyboard sensor makes Space,
 * arrows, Space move a card.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );
}
