#!/usr/bin/env bash
# adb UI driver used to test the active-ride screens on a device/emulator.
#
#   source docs/active-ride-redesign/tools/adb-ui-driver.sh
#   tap_text "Start trip"      # tap the element whose text/content-desc matches
#   shot expanded              # screenshot -> $ADB_UI_OUT/expanded.png
#   hud                        # print the spike HUD lines (spike harness only)
#
# Env: ADB_UI_OUT (default ./.adb-ui), ADB_UI_PKG (default the .dev test
# build), ANDROID_SERIAL (pick a device when several are attached).
#
# Git Bash on Windows: MSYS_NO_PATHCONV=1 stops it rewriting /sdcard/... into
# a Windows path, which also means host paths given to adb (e.g. an APK) must
# be Windows-style (C:/...), not /c/...

export MSYS_NO_PATHCONV=1
ADB_UI_OUT="${ADB_UI_OUT:-./.adb-ui}"
ADB_UI_PKG="${ADB_UI_PKG:-com.transli.mobilitycustomer.dev}"
mkdir -p "$ADB_UI_OUT"

# Dump the current UI hierarchy to $ADB_UI_OUT/ui.xml. Note: it includes
# off-screen views (e.g. a screen under a transparent modal, or pager pages
# composed beyond the viewport), so "text exists" != "text is visible".
dump() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb exec-out cat /sdcard/ui.xml > "$ADB_UI_OUT/ui.xml"
}

# Print "x y" centre of the first node whose text or content-desc equals $1.
find_node() {
  dump
  node -e '
    const xml = require("fs").readFileSync(process.argv[1], "utf8");
    const want = process.argv[2];
    const re = /<node [^>]*?(?:text|content-desc)="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
    let m;
    while ((m = re.exec(xml))) {
      if (m[1] === want) {
        console.log(((+m[2] + +m[4]) >> 1) + " " + ((+m[3] + +m[5]) >> 1));
        process.exit(0);
      }
    }
    process.exit(1);
  ' "$ADB_UI_OUT/ui.xml" "$1"
}

tap_text() {
  local xy
  xy=$(find_node "$1") || { echo "NOT FOUND: $1" >&2; return 1; }
  adb shell input tap $xy
}

# Screenshot. ~0.5 s per capture: too slow to catch mid-animation frames.
shot() { adb exec-out screencap -p > "$ADB_UI_OUT/$1.png"; echo "$ADB_UI_OUT/$1.png"; }

# Spike harness HUD lines (Path A/B, fps, cycles, camera, gps).
hud() {
  dump
  node -e '
    const xml = require("fs").readFileSync(process.argv[1], "utf8");
    const re = /text="([^"]*)"/g; let m;
    while ((m = re.exec(xml))) {
      const t = m[1].replace(/&#10;/g, " ").replace(/&amp;/g, "&");
      if (/^Path [AB]|fps|cycles|camera|gps /.test(t)) console.log(t);
    }
  ' "$ADB_UI_OUT/ui.xml"
}

app_alive() { adb shell pidof "$ADB_UI_PKG" >/dev/null && echo alive || echo NOT_RUNNING; }
