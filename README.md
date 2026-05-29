# Sitwego Rider App

Android app for Sitwego riders to book and track rides. Built with React Native + Expo.

[<img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" height="64">](https://play.google.com/store/apps/details?id=com.transli.mobilitycustomer)

> 📲 **[Download on Google Play](https://play.google.com/store/apps/details?id=com.transli.mobilitycustomer)**

---

## Stack

- **React Native** 0.83 · Expo SDK 55 · TypeScript
- **TanStack Query** v5 — server state & caching
- **Axios** — REST API client
- **gRPC** (native, OkHttp) — real-time ride events
- **Firebase** — Auth, Messaging (push notifications)
- **Google Sign-In** — social authentication
- **react-native-maps** + Google Maps — live map & routing
- **React Navigation** v7 — routing

---

## Prerequisites

- **Node.js** ≥ 20
- **Yarn** 1.22 — `npm i -g yarn`
- **JDK** 17 (OpenJDK recommended)
- **Android SDK** with build-tools 35, NDK (set `ANDROID_HOME`)
- **Expo CLI** — `npm i -g expo-cli` *(optional, `npx expo` also works)*

---

## Setup

### 1. Clone

```bash
git clone https://github.com/Sitwego/Rider-App.git
cd Rider-App
```

### 2. Install dependencies

```bash
yarn install
```

### 3. Environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
API_BASE_URL=https://<your-api-host>/   # REST API base URL (dev tunnel or production)
GRPC_HOST=<your-grpc-host>              # gRPC server host (no scheme)
APP_ENV=development                     # development | staging | production
GOOGLE_MAPS_API_KEY=AIza...             # Google Cloud Console
```

> These vars are consumed at native build time via `react-native-config`. `GOOGLE_MAPS_API_KEY` is also written into `AndroidManifest.xml` during prebuild. `.env` is gitignored — never commit real keys.

### 4. Firebase

Place `google-services.json` in the project root (gitignored). Download it from the Firebase Console → Project settings → Your Android app.

### 5. Release signing (for release builds only)

Add to `android/local.properties` (already gitignored):

```properties
RELEASE_STORE_FILE=/path/to/your.keystore
RELEASE_STORE_PASSWORD=...
RELEASE_KEY_ALIAS=...
RELEASE_KEY_PASSWORD=...
```

---

## Build flavors

The Android build defines three product flavors on the `environment` dimension: `dev`, `staging`, and `production`.

---

## Running

| Command | Description |
|---|---|
| `yarn android` | Build and run the **dev** debug variant on a connected device / emulator |
| `yarn android:staging` | Build and run the **staging** debug variant |
| `yarn android:prod` | Build and run the **production** release variant |
| `yarn start` | Start the Metro bundler (reset cache) |
| `yarn build` | Assemble the production release APK |
| `yarn build:staging` | Assemble the staging release APK |
| `yarn release` | Build and run the production release on device |
| `yarn clean` | Clean the Gradle build cache |
| `yarn lint` | Run the linter |

---

## Contributing

We welcome contributions, but we prioritize high-quality issues and pull requests. Following these guidelines helps ensure a timely review.

**Rules:**
- We may not respond to every issue or PR.
- We may close an issue or PR without detailed feedback.
- We may lock discussions if our attention is being overwhelmed.
- We don't provide support for general build environment issues.

**Guidelines:**
- Check for existing issues before filing a new one.
- Open an issue and allow time for discussion before submitting a PR.

**PRs we'll skip:**
- Pure cosmetic or naming changes.
- Refactoring the codebase (e.g. swapping TanStack Query for Redux, restructuring navigation).
- Adding entirely new features without prior discussion.

We serve riders across a wide range of conditions and devices. Well-written PRs that solve real problems concisely are the most valuable contributions. If your idea is bigger in scope, feel free to fork — that's what it's for.

### Forking

You're welcome to fork this app. If you do, please:

- Change all branding in the repository and UI to clearly differentiate from Sitwego.
- Update any support links (feedback forms, email, terms of service) to point to your own systems.
- Replace any analytics or error-collection integrations so data doesn't flow to Sitwego's systems.

**AGPL-3.0 notice:** this project is licensed under the GNU Affero General Public License v3.0. If you run a modified version of this app as a network service (including a backend that riders connect to), you are required to make the complete corresponding source code of your modified version publicly available. This applies even if you never distribute the app as a binary. See the [LICENSE](./LICENSE) for the full terms.

### Security disclosures

If you discover a security vulnerability, please email **sityf237@gmail.com**. Do not open a public issue. We'll respond promptly.

---

## License

[GNU Affero General Public License v3.0](./LICENSE)
