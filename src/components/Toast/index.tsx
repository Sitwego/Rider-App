import React, { JSX } from "react";
import { toast as sonner, Toaster, ToastProps } from "sonner-native";

import { s } from "~/styles/Common-Styles";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import { atoms } from "~/ui/theme/atoms";
import { themes } from "~/ui/theme/utils";

export type ToastType = "default" | "success" | "error" | "warning" | "info";

export const DURATION = 3000;

/**
 * Toast are rendered on global level using sonner-native, placed in the root layout.
 * This component is just a wrapper around the Toaster component from sonner-native.
 * @returns {JSX.Element}
 */
export function ToastComponent(): JSX.Element {
  return <Toaster pauseWhenPageIsHidden gap={s.gap12.gap} />;
}

/**
 * Exporting the toast API from sonner-native for use in the application.
 */
export const toastApi = sonner;

export type { ToastProps } from "sonner-native";

/**
 * Base toast function to show a toast message.
 * @param content - The content of the toast message.
 * @param options - Optional toast properties.
 * @param Icon - Optional icon to display in the toast.
 */

export function showToast(
  content: React.ReactNode,
  options?: ToastProps,
  Icon?: JSX.Element,
): void {
  const id = generateUUID();

  if (typeof content === "string") {
    sonner.custom(
      <RnView
        style={[
          s.w100pct,
          s.flexDirectionRow,
          s.gap8,
          s.py20,
          s.px10,
          s.borderRadius_sm,
          { backgroundColor: themes.bg_900 },
        ]}
      >
        {Icon}
        <RnText style={[atoms.text_sm]} selectable={false}>
          {content}
        </RnText>
      </RnView>,
      { ...options, id, duration: options?.duration ?? DURATION },
    );
  } else if (React.isValidElement(content)) {
    sonner.custom(<React.Fragment>{content}</React.Fragment>, {
      ...options,
      id,
      duration: options?.duration ?? DURATION,
    });
  }
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
