/**
 * Unit tests for pure-TypeScript modules that have no react-native/expo
 * runtime imports, so they run in plain Node — no jest-expo preset or native
 * mocks needed:
 *   - src/tracking          (tracking engine)
 *   - src/ui/BottomSheet    (the bottom-sheet registry/stack store)
 *
 * `isolatedModules` transpiles each file on its own (type-only imports are
 * erased), so the store's `import type` references to react-native / the sheet
 * library never pull those packages into the Node test runtime.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src/tracking", "<rootDir>/src/ui/BottomSheet"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        // The app tsconfig targets the RN bundler (module: esnext);
        // jest needs CommonJS output.
        tsconfig: { module: "commonjs", types: ["node"] },
      },
    ],
  },
};
