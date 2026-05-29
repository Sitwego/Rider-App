/**
 * googleLink.android.ts
 *
 * Helper for linking an existing rider account to a Google account on Android.
 * Uses the installed @react-native-google-signin/google-signin package.
 *
 * Usage:
 *   import { requestGoogleIdToken } from '~/helpers/googleLink.android';
 *   const { idToken, email } = await requestGoogleIdToken();
 */

import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

// Web client ID (type 3) from android/app/google-services.json
const WEB_CLIENT_ID =
  "517170928109-crrbgpa09csdos56amfgi26lrmb9f3vg.apps.googleusercontent.com";

export type GoogleLinkResult = {
  idToken: string;
  email: string;
};

export class GoogleLinkCancelledError extends Error {
  constructor() {
    super("Google sign-in was cancelled by the user.");
    this.name = "GoogleLinkCancelledError";
  }
}

export class GoogleLinkError extends Error {
  code?: string | number;
  constructor(message: string, code?: string | number) {
    super(message);
    this.name = "GoogleLinkError";
    this.code = code;
  }
}

/**
 * Configures GoogleSignin, forces the account picker by signing out first,
 * then runs the sign-in flow and returns the idToken + email.
 *
 * Throws `GoogleLinkCancelledError` when the user dismisses the picker.
 * Throws `GoogleLinkError` for all other failures.
 */
export async function requestGoogleIdToken(): Promise<GoogleLinkResult> {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  });

  // Force the account chooser to appear every time
  await GoogleSignin.signOut().catch(() => {
    // ignore — signOut can fail if no previous session exists
  });

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (err: any) {
    if (err?.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new GoogleLinkCancelledError();
    }
    throw new GoogleLinkError(
      err?.message ?? "Google sign-in failed",
      err?.code,
    );
  }

  const idToken = response?.data?.idToken;
  const email = response?.data?.user?.email;

  if (!idToken) {
    throw new GoogleLinkError("Google sign-in did not return an idToken.");
  }

  return { idToken, email: email ?? "" };
}
