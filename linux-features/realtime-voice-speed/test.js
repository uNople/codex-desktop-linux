#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");
const {
  DEFAULT_SPEED,
  SETTINGS_KEY,
  applyLinuxDesktopSettingsPatch,
  applyRealtimeVoiceSpeedPatch,
  clampSpeed,
  descriptors,
  matchesRealtimeVoiceContract,
  patchLinuxDesktopSettingsAsset,
  realtimeRuntimeSource,
} = require("./patch.js");

const realtimeFixture = [
  "before;",
  "cns=class e{peerConnection;microphone;audioElement;dataChannel;",
  "onConnectionFailed;hasConnected=!1;hasConnectionFailed=!1;isStopped=!1;",
  "constructor(e,t,n,r,i){this.peerConnection=e,this.microphone=t,",
  "this.audioElement=n,this.dataChannel=r,this.onConnectionFailed=i}static async start",
  "(){let d=c.createDataChannel(sns)}",
  "refreshMicrophoneInput(e){return this.microphone.refreshInput(e)}stop(e){let t=",
  "!this.isStopped;this.isStopped=!0}};",
  "class Voice{#c=!1;#s=null;#g(e){let r=dns.safeParse(e);",
  "!r.success||this.#c||(this.#c=!0,Hf.info(`realtime_session_updated`,",
  "{safe:{}}),this.ready())}};after;",
].join("");

const linuxSettingsFixture =
  'import{React,$,__post,SettingsRow,SettingsSection,SettingsGroup}from"./deps.js";' +
  'var KEYS={promptWindow:"codex-linux-prompt-window-enabled",' +
  'autoUpdateOnExit:"codex-linux-auto-update-on-exit"};' +
  "function LinuxBuildInfoPanel(){}" +
  'function LinuxDesktopSettings(){return $.jsx(SettingsPage,{title:"Linux desktop",' +
  'children:$.jsxs("div",{children:[' +
  '$.jsxs(SettingsSection,{className:"gap-2",children:[$.jsx(SettingsSection.Header,' +
  '{title:"Build"}),$.jsx(SettingsSection.Content,{children:$.jsx(SettingsGroup,' +
  "{children:$.jsx(LinuxBuildInfoPanel,{})})})]})]})})}" +
  "export{LinuxDesktopSettings};";

function captureWarns(fn) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    return { value: fn(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function withFeatureConfig(enabled, fn) {
  const originalConfig = process.env.CODEX_LINUX_FEATURES_CONFIG;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "realtime-voice-speed-"));
  process.env.CODEX_LINUX_FEATURES_CONFIG = path.join(tempDir, "features.json");
  try {
    fs.writeFileSync(process.env.CODEX_LINUX_FEATURES_CONFIG, JSON.stringify({ enabled }));
    return fn();
  } finally {
    if (originalConfig == null) {
      delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    } else {
      process.env.CODEX_LINUX_FEATURES_CONFIG = originalConfig;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("feature is disabled until selected", () => {
  const featuresRoot = path.resolve(__dirname, "..");
  withFeatureConfig([], () => {
    assert.equal(
      loadLinuxFeaturePatchDescriptors({ featuresRoot })
        .some((descriptor) => descriptor.id.startsWith("feature:realtime-voice-speed:")),
      false,
    );
  });
  withFeatureConfig(["realtime-voice-speed"], () => {
    assert.equal(
      loadLinuxFeaturePatchDescriptors({ featuresRoot })
        .filter((descriptor) => descriptor.id.startsWith("feature:realtime-voice-speed:"))
        .length,
      2,
    );
  });
});

test("speed clamps to the native API range and step", () => {
  assert.equal(clampSpeed(undefined), DEFAULT_SPEED);
  assert.equal(clampSpeed(0), 0.25);
  assert.equal(clampSpeed(0.27), 0.25);
  assert.equal(clampSpeed(1.22), 1.2);
  assert.equal(clampSpeed(1.49), 1.5);
  assert.equal(clampSpeed(9), 1.5);
});

test("runtime helper defaults, persists, and updates active sessions", () => {
  const values = new Map();
  const updates = [];
  const context = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  vm.runInNewContext(realtimeRuntimeSource(), context);

  assert.equal(context.codexLinuxRealtimeVoiceSpeed(), 1.5);
  context.codexLinuxRealtimeVoiceSpeedSessions.add({
    sendRealtimeSessionUpdate: (update) => updates.push(update),
  });
  assert.equal(context.codexLinuxSetRealtimeVoiceSpeed(1.2), 1.2);
  assert.equal(values.get(SETTINGS_KEY), "1.2");
  assert.equal(JSON.stringify(updates), JSON.stringify([{ speed: 1.2 }]));
});

test("Realtime patch sends speed over the existing data channel", () => {
  assert.equal(matchesRealtimeVoiceContract(realtimeFixture), true);
  const patched = applyRealtimeVoiceSpeedPatch(realtimeFixture);

  assert.match(patched, /codexLinuxRealtimeVoiceSpeedPatchVersion="1"/);
  assert.match(patched, /type:`session\.update`,session:e/);
  assert.match(
    patched,
    /sendRealtimeSessionUpdate\(\{speed:globalThis\.codexLinuxRealtimeVoiceSpeed\(\)\}\)/,
  );
  assert.match(patched, /codexLinuxRealtimeVoiceSpeedSessions\.delete\(this\)/);
  assert.equal(applyRealtimeVoiceSpeedPatch(patched), patched);
  assert.equal(matchesRealtimeVoiceContract(patched), true);
});

test("Realtime drift leaves the asset byte-identical", () => {
  const drifted = realtimeFixture.replace("createDataChannel(sns)", "createDataChannel(name)");
  const { value, warnings } = captureWarns(() => applyRealtimeVoiceSpeedPatch(drifted));

  assert.equal(value, drifted);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Realtime WebRTC insertion points/);
});

test("Linux desktop settings patch adds the speed slider", () => {
  const patched = applyLinuxDesktopSettingsPatch(linuxSettingsFixture);

  assert.match(patched, /realtimeVoiceSpeed:"codex-linux-realtime-voice-speed"/);
  assert.match(patched, /class LinuxRealtimeVoiceSpeedSettings extends React\.Component/);
  assert.match(patched, /title:"Realtime voice"/);
  assert.match(patched, /type:"range",min:0\.25,max:1\.5,step:0\.05/);
  assert.match(patched, /children:`\$\{e\.toFixed\(2\)\}x`/);
  assert.equal(applyLinuxDesktopSettingsPatch(patched), patched);
});

test("settings asset patch writes only the current generated settings file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "realtime-speed-settings-"));
  try {
    const assetsDir = path.join(tempDir, "webview", "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(
      path.join(assetsDir, "linux-desktop-settings-linux.js"),
      linuxSettingsFixture,
    );

    assert.deepEqual(patchLinuxDesktopSettingsAsset(tempDir), {
      matched: true,
      changed: 1,
    });
    assert.deepEqual(patchLinuxDesktopSettingsAsset(tempDir), {
      matched: true,
      changed: 0,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("descriptors target the current semantic contracts", () => {
  assert.equal(descriptors[0].assetMatch(realtimeFixture), true);
  assert.equal(descriptors[0].assetMatch("createDataChannel(name)"), false);
  assert.equal(descriptors[0].ciPolicy, "optional");
  assert.equal(descriptors[1].phase, "extracted-app:post-webview");
});
