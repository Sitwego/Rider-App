# Composable Bottom Sheet

A small, fully-typed module for opening modal bottom sheets imperatively from
anywhere in the app, built on
[`@swmansion/react-native-bottom-sheet`](https://github.com/software-mansion-labs/react-native-bottom-sheet)
(native, portal-based — **not** `@gorhom/bottom-sheet`).

Feature code imports only from this folder (`~/ui/BottomSheet`) — the
library-specific wiring is fully encapsulated.

## Setup

`AppBottomSheetProvider` is mounted once in `src/App.tsx`, **inside** the
library's `BottomSheetProvider` (whose portal renders the sheets) and **below**
`SafeAreaProvider`. Nothing else to wire up.

> **Native build required.** This library has native code; it does **not** run
> in Expo Go. Use a dev client / `expo run:android` / `expo run:ios`. The native
> module is already a dependency, so a normal rebuild picks it up.

## Public API

```ts
import {
  useBottomSheet,        // imperative controller
  AppBottomSheet,        // declarative, screen-local sheet
  programmatic,          // mark a detent as code-only
  type BottomSheetOptions,
  type DismissReason,
  type SheetId,
} from "~/ui/BottomSheet";

const sheet = useBottomSheet();
const id = sheet.present(content, options?); // => SheetId
sheet.update(id, { content?, options? });
sheet.dismiss(id?);   // omit id to dismiss the top sheet
sheet.dismissAll();
```

`onDismiss(reason)` always fires on every close path — drag, backdrop tap,
hardware back, programmatic `dismiss`, or (for `AppBottomSheet`) the screen
unmounting. `reason` is `"user" | "back" | "programmatic"`.

## Examples

### 1. Imperative — a simple confirmation sheet from a button handler

```tsx
const sheet = useBottomSheet();

const confirmDelete = () => {
  const id = sheet.present(
    ({ dismiss }) => (
      <View>
        <RnText>Delete this trip?</RnText>
        <Pressable onPress={() => { doDelete(); dismiss(); }}>
          <RnText>Delete</RnText>
        </Pressable>
        <Pressable onPress={dismiss}>
          <RnText>Cancel</RnText>
        </Pressable>
      </View>
    ),
    { detents: [0, "content"], onDismiss: (reason) => console.log("closed:", reason) },
  );
  // `id` can later be passed to sheet.update(id, …) / sheet.dismiss(id).
};
```

### 2. Declarative — a screen-local sheet with a scrollable list

```tsx
const [open, setOpen] = useState(false);

<AppBottomSheet
  open={open}
  onDismiss={() => setOpen(false)}
  detents={[0, 400, "content"]}
  accessibilityLabel="Pick a saved place"
>
  {/* Plain RN ScrollView/FlatList work inside the sheet — no wrapper lists. */}
  <FlatList data={places} renderItem={renderPlace} />
</AppBottomSheet>
```

### 3. Stacked sheet (sheet-over-sheet)

```tsx
const sheet = useBottomSheet();

const detailsId = sheet.present(<TripDetails />, { detents: [0, "content"] });

// Open a confirmation on top of the details sheet. The new sheet layers above
// the previous one with its own backdrop; hardware back / an untargeted
// dismiss() closes the top-most sheet first.
sheet.present(<ConfirmCancel />, { detents: [0, "content"] });
```

### 4. Content-sized vs fixed-detent

```tsx
// Content-sized: the sheet measures its content height (the default).
sheet.present(<ShortForm />, { detents: [0, "content"] });

// Fixed detents: snaps to 300px then 600px, ignoring content height.
sheet.present(<TallList />, { detents: [0, 300, 600], index: 1 });

// Non-dismissible (blocks drag-to-close AND backdrop-tap; programmatic only).
sheet.present(<BlockingFlow />, { dismissible: false });

// Programmatic-only middle detent (reachable via index, not by dragging).
sheet.present(<Player />, { detents: [0, programmatic(120), "content"] });
```

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `detents` | `[0, "content"]` | Ascending by height. A leading `0` (closed) detent is ensured automatically. |
| `index` | tallest detent | Initial zero-based index. |
| `dismissible` | `true` | `false` ⇒ only programmatic dismissal. |
| `onDismiss` | — | `(reason) => void`, fires on every close path. |
| `backdrop` | visible, `0.5` | `{ visible, opacity, color, tapToDismiss }`. |
| `surface` | theme tokens | `{ backgroundColor, borderRadius, showHandle, handleColor }`. |
| `keyboardBehavior` | `"padding"` | `"none"` to opt out of keyboard avoidance. |
| `respectSafeArea` | `true` | Pads content by the bottom safe-area inset. |
| `extendUnderStatusBar` | `false` | Allow full-height detents under the status bar. |
| `nativeOverlay` | `false` | Present above native modal screens (window-level overlay). |
| `accessibilityLabel` / `testID` | — | Applied to the content container. |
| `onIndexChange` / `onSettle` / `onPositionChange` | — | Library passthroughs. |

## Library behaviors that required workarounds, and known gaps

The library is pre-1.0 (pinned at **v0.15.3**). Notable adaptations:

- **Dismissal is index-driven.** The library has no `open`/`dismiss` prop — a
  sheet closes by animating its controlled `index` to a `0`-height detent. We
  ensure a leading `0` detent (`closedIndex === 0`) and treat settling there as
  "dismissed", which is how `onDismiss` is guaranteed to fire on every path.
- **No `backdrop` prop.** Mapped onto the library's `scrimColor` +
  per-detent `scrimOpacities`. `backdrop.opacity` becomes the scrim opacity at
  open detents (0 at the closed detent).
- **`dismissible: false` / `backdrop.tapToDismiss: false` can't be separated.**
  The only lever is making the closed detent `programmatic`, which disables
  **both** drag-to-close **and** backdrop-tap together. There is no way to allow
  drag-to-close while blocking backdrop-tap (or vice-versa).
- **No built-in handle, keyboard avoidance, hardware-back, or focus trap.** All
  implemented here: the handle lives in `BottomSheetSurface`; keyboard padding
  via RN `Keyboard` events; a single `BackHandler` subscription in the host;
  `accessibilityViewIsModal` + `setAccessibilityFocus` on the content container.
- **Accessibility focus** is moved into the sheet on mount via
  `setAccessibilityFocus`. This is best-effort across OS versions; on some
  Android builds focus movement can be inconsistent (platform limitation).
- **`onIndexChange` fires on snap _start_, not settle** — `onSettle` is the
  reliable end-of-movement signal, which is what drives finalization here.

### Not covered / caveats

- **No automated UI/native tests.** The native module can't run under the
  project's Node/ts-jest setup. Unit tests cover the pure registry/stack logic
  (`store.ts`); the rendering/native paths need manual or device testing.
- **`AppBottomSheet` requires the provider.** It bridges into the shared host
  (to inherit stacking, hardware-back, and dismiss-on-unmount), so it must be
  mounted under `AppBottomSheetProvider`.
- **Imperative `present` does not auto-dismiss on navigation.** Sheets opened
  via `useBottomSheet().present` live in the global stack; dismiss them
  explicitly (or use `AppBottomSheet`, which auto-dismisses on unmount).
