/**
 * Unit tests for the pure-TypeScript tracking engine only (src/tracking).
 * The engine has no react-native/expo imports, so it runs in plain Node —
 * no jest-expo preset or native mocks needed.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src/tracking"],
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
