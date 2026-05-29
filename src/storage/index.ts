import { useCallback, useEffect, useState } from "react";
import { createMMKV } from "react-native-mmkv";

import {
  ACTIVE_RIDE_STORAGE_KEY,
  USER_PROFILE_STORAGE_KEY,
} from "~/constants/RIDE_CONSTANTS";
import { UserState } from "~/types/accountTypes";
import { ActiveRideState } from "~/types/rideRequestTypes";

export type UserProfileSchema = {
  user_profile: UserState;
};

export type ActiveRideSchema = {
  active_ride: Omit<ActiveRideState, "should_persist">;
};

/**
 * Generic storage class. DO NOT use this directly. Instead, use the exported
 * storage instances below.
 */
export class Storage<T extends unknown[], Schema> {
  protected storage: ReturnType<typeof createMMKV>;
  protected separator = "::";

  constructor(storageId: string) {
    this.storage = createMMKV({ id: storageId });
  }

  /**
   * Store a value in storage based on scopes and/or keys
   *
   *   `set([key], value)`
   *   `set([scope, key], value)`
   */
  set<K extends keyof Schema>(scopes: [...T, key: K], value: Schema[K]): void {
    // stored as `{ data: <value> }` structure to ease stringification
    const storageKey = scopes.join(this.separator);
    this.storage.set(storageKey, JSON.stringify({ data: value }));
  }

  /**
   * Get a value from storage based on scopes and/or keys
   *
   *   `get([key])`
   *   `get([scope, key])`
   */
  get<K extends keyof Schema>(scopes: [...T, key: K]): Schema[K] | null {
    const storageKey = scopes.join(this.separator);
    const storedValue = this.storage.getString(storageKey);
    if (storedValue) {
      try {
        const parsed = JSON.parse(storedValue);
        return parsed.data as Schema[K];
      } catch (e) {
        console.warn(
          `Storage: failed to parse stored value for key ${storageKey}`,
        );
        return null;
      }
    }
    return null;
  }

  /**
   * Remove a value from storage based on scopes and/or keys
   *
   *   `remove([key])`
   *   `remove([scope, key])`
   */
  remove<K extends keyof Schema>(scopes: [...T, key: K]): void {
    const storageKey = scopes.join(this.separator);
    this.storage.remove(storageKey);
  }

  /**
   * Remove many values from the same storage scope by keys
   *
   *   `removeMany([], [key])`
   *   `removeMany([scope], [key])`
   */
  removeMany<K extends keyof Schema>(scopes: T, keys: K[]): void {
    keys.forEach((key) => {
      const storageKey = [...scopes, key].join(this.separator);
      this.storage.remove(storageKey);
    });
  }

  /**
   * Fires a callback when the storage associated with a given key changes
   *
   * @returns Listener - call `remove()` to stop listening
   */
  addOnValueChangedListener<K extends keyof Schema>(
    scope: [...T, key: K],
    callback: (newValue: Schema[K] | null) => void,
  ) {
    return this.storage.addOnValueChangedListener((key) => {
      const storageKey = scope.join(this.separator);
      if (key === storageKey) {
        callback(this.get(scope));
      }
    });
  }
}

export const userProfileStorage = new Storage<[], UserProfileSchema>(
  USER_PROFILE_STORAGE_KEY,
);

export const activeRideStorage = new Storage<[], ActiveRideSchema>(
  ACTIVE_RIDE_STORAGE_KEY,
);
