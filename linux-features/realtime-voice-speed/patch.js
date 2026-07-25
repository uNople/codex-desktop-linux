"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  linuxSettingsKeys,
} = require("../../scripts/patches/lib/settings-keys.js");

const SETTINGS_KEY = "codex-linux-realtime-voice-speed";
const DEFAULT_SPEED = 1.5;
const MIN_SPEED = 0.25;
const MAX_SPEED = 1.5;
const STEP = 0.05;
const STEPS_PER_UNIT = 1 / STEP;
const RUNTIME_MARKER = "codexLinuxRealtimeVoiceSpeedPatchVersion";
const LINUX_DESKTOP_SETTINGS_ASSET = "linux-desktop-settings-linux.js";

const REALTIME_CLASS_NEEDLE =
  "cns=class e{peerConnection;microphone;audioElement;dataChannel;";
const REALTIME_DATA_CHANNEL_NEEDLE = "createDataChannel(sns)";
const REALTIME_CONSTRUCTOR_NEEDLE =
  "this.audioElement=n,this.dataChannel=r,this.onConnectionFailed=i}static async start";
const REALTIME_METHOD_NEEDLE =
  "refreshMicrophoneInput(e){return this.microphone.refreshInput(e)}stop(e){let t=";
const REALTIME_SESSION_HANDLER_NEEDLE =
  "!r.success||this.#c||(this.#c=!0,Hf.info(`realtime_session_updated`";

function warn(message, patchName) {
  console.warn(`WARN: ${message} - skipping ${patchName}`);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function clampSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SPEED;
  }
  return Math.min(
    MAX_SPEED,
    Math.max(MIN_SPEED, Math.round(numeric * STEPS_PER_UNIT) / STEPS_PER_UNIT),
  );
}

function realtimeRuntimeSource() {
  return [
    `globalThis.${RUNTIME_MARKER}="1";`,
    `globalThis.codexLinuxRealtimeVoiceSpeedSessions??=new Set;`,
    `globalThis.codexLinuxRealtimeVoiceSpeedClamp=e=>{let t=Number(e);return Number.isFinite(t)?Math.min(${MAX_SPEED},Math.max(${MIN_SPEED},Math.round(t*${STEPS_PER_UNIT})/${STEPS_PER_UNIT})):${DEFAULT_SPEED}};`,
    `globalThis.codexLinuxRealtimeVoiceSpeed=()=>{try{let e=localStorage.getItem(${JSON.stringify(SETTINGS_KEY)});return globalThis.codexLinuxRealtimeVoiceSpeedClamp(e==null?${DEFAULT_SPEED}:e)}catch{return ${DEFAULT_SPEED}}};`,
    `globalThis.codexLinuxSetRealtimeVoiceSpeed=e=>{let t=globalThis.codexLinuxRealtimeVoiceSpeedClamp(e);try{localStorage.setItem(${JSON.stringify(SETTINGS_KEY)},String(t))}catch{}for(let e of globalThis.codexLinuxRealtimeVoiceSpeedSessions)e.sendRealtimeSessionUpdate({speed:t});return t};`,
  ].join("");
}

function matchesRealtimeVoiceContract(source) {
  return (
    source.includes("createDataChannel(sns)") &&
    source.includes("realtime_session_updated") &&
    (source.includes(REALTIME_SESSION_HANDLER_NEEDLE) ||
      source.includes(`${RUNTIME_MARKER}="1"`))
  );
}

function applyRealtimeVoiceSpeedPatch(source) {
  if (source.includes(`${RUNTIME_MARKER}="1"`)) {
    return source;
  }

  const needles = [
    REALTIME_CLASS_NEEDLE,
    REALTIME_DATA_CHANNEL_NEEDLE,
    REALTIME_CONSTRUCTOR_NEEDLE,
    REALTIME_METHOD_NEEDLE,
    REALTIME_SESSION_HANDLER_NEEDLE,
  ];
  if (needles.some((needle) => countOccurrences(source, needle) !== 1)) {
    warn(
      "Could not find unique current Realtime WebRTC insertion points",
      "realtime voice speed runtime patch",
    );
    return source;
  }

  return source
    .replace(REALTIME_CLASS_NEEDLE, `${realtimeRuntimeSource()}${REALTIME_CLASS_NEEDLE}`)
    .replace(
      REALTIME_CONSTRUCTOR_NEEDLE,
      `this.audioElement=n,this.dataChannel=r,this.onConnectionFailed=i,globalThis.codexLinuxRealtimeVoiceSpeedSessions.add(this)}static async start`,
    )
    .replace(
      REALTIME_METHOD_NEEDLE,
      `refreshMicrophoneInput(e){return this.microphone.refreshInput(e)}sendRealtimeSessionUpdate(e){if(this.isStopped||this.dataChannel.readyState!==\`open\`)return!1;try{return this.dataChannel.send(JSON.stringify({type:\`session.update\`,session:e})),!0}catch{return!1}}stop(e){globalThis.codexLinuxRealtimeVoiceSpeedSessions.delete(this);let t=`,
    )
    .replace(
      REALTIME_SESSION_HANDLER_NEEDLE,
      `!r.success||this.#c||(this.#c=!0,this.#s?.sendRealtimeSessionUpdate({speed:globalThis.codexLinuxRealtimeVoiceSpeed()}),Hf.info(\`realtime_session_updated\``,
    );
}

function realtimeVoiceSettingsSource() {
  return [
    `function codexLinuxRealtimeVoiceSpeedValue(e){let t=Number(e);return Number.isFinite(t)?Math.min(${MAX_SPEED},Math.max(${MIN_SPEED},Math.round(t*${STEPS_PER_UNIT})/${STEPS_PER_UNIT})):${DEFAULT_SPEED}}`,
    `class LinuxRealtimeVoiceSpeedSettings extends React.Component{`,
    `constructor(e){super(e),this._alive=!1,this._write=0,this._confirmed=${DEFAULT_SPEED},this._queue=Promise.resolve(),this.state={speed:${DEFAULT_SPEED},isLoading:!0,error:null},this.load=this.load.bind(this),this.update=this.update.bind(this)}`,
    `componentDidMount(){this._alive=!0,this.load()}`,
    `componentWillUnmount(){this._alive=!1}`,
    `load(){this.setState({isLoading:!0}),__post("get-global-state",{params:{key:KEYS.realtimeVoiceSpeed}}).then(e=>{if(!this._alive)return;let t=codexLinuxRealtimeVoiceSpeedValue(e?.value??${DEFAULT_SPEED});this._confirmed=t,globalThis.codexLinuxSetRealtimeVoiceSpeed?.(t),this.setState({speed:t,error:null})}).catch(e=>{this._alive&&this.setState({error:e instanceof Error?e.message:String(e)})}).finally(()=>{this._alive&&this.setState({isLoading:!1})})}`,
    `update(e){let t=codexLinuxRealtimeVoiceSpeedValue(e?.currentTarget?.value??e),n=++this._write,r=()=>__post("set-global-state",{params:{key:KEYS.realtimeVoiceSpeed,value:t}});this.setState({speed:t,error:null}),globalThis.codexLinuxSetRealtimeVoiceSpeed?.(t),this._queue=this._queue.then(r,r),this._queue.then(()=>{this._confirmed=t,this._alive&&n===this._write&&this.setState({speed:t,error:null})},e=>{this._alive&&n===this._write&&(globalThis.codexLinuxSetRealtimeVoiceSpeed?.(this._confirmed),this.setState({speed:this._confirmed,error:e instanceof Error?e.message:String(e)}))})}`,
    `render(){let{speed:e,isLoading:t,error:n}=this.state,r=n?$.jsxs("div",{className:"flex flex-col gap-1",children:[$.jsx("span",{children:"Adjust native Realtime speech speed without changing pitch."}),$.jsx("span",{className:"text-token-error-foreground",children:n})]}):"Adjust native Realtime speech speed without changing pitch.";return $.jsxs(SettingsSection,{className:"gap-2",children:[$.jsx(SettingsSection.Header,{title:"Realtime voice"}),$.jsx(SettingsSection.Content,{children:$.jsx(SettingsGroup,{children:$.jsx(SettingsRow,{label:"Speech speed",description:r,control:$.jsxs("div",{className:"flex items-center justify-end gap-2",children:[$.jsx("input",{type:"range",min:${MIN_SPEED},max:${MAX_SPEED},step:${STEP},value:e,disabled:t,onChange:this.update,"aria-label":"Realtime voice speech speed",className:"h-2 w-36 accent-token-text-primary"}),$.jsx("span",{className:"w-12 text-right text-sm text-token-text-secondary",children:\`\${e.toFixed(2)}x\`})]})})})})]})}}`,
  ].join("");
}

function applyLinuxDesktopSettingsPatch(source) {
  if (
    source.includes("class LinuxRealtimeVoiceSpeedSettings extends React.Component") &&
    source.includes("$.jsx(LinuxRealtimeVoiceSpeedSettings,{})")
  ) {
    return source;
  }
  if (!source.includes("function LinuxDesktopSettings(){")) {
    return source;
  }

  const keyNeedle =
    `autoUpdateOnExit:${JSON.stringify(linuxSettingsKeys.autoUpdateOnExit)}`;
  const buildSectionNeedle =
    '$.jsxs(SettingsSection,{className:"gap-2",children:[$.jsx(SettingsSection.Header,{title:"Build"}),$.jsx(SettingsSection.Content,{children:$.jsx(SettingsGroup,{children:$.jsx(LinuxBuildInfoPanel,{})})})]})';
  if (
    countOccurrences(source, keyNeedle) !== 1 ||
    countOccurrences(source, buildSectionNeedle) !== 1
  ) {
    warn(
      "Could not find unique current Linux desktop settings insertion points",
      "realtime voice speed settings patch",
    );
    return source;
  }

  return source
    .replace(
      keyNeedle,
      `${keyNeedle},realtimeVoiceSpeed:${JSON.stringify(SETTINGS_KEY)}`,
    )
    .replace(
      "function LinuxDesktopSettings(){",
      `${realtimeVoiceSettingsSource()}function LinuxDesktopSettings(){`,
    )
    .replace(
      buildSectionNeedle,
      `$.jsx(LinuxRealtimeVoiceSpeedSettings,{}),${buildSectionNeedle}`,
    );
}

function patchLinuxDesktopSettingsAsset(extractedDir) {
  const assetPath = path.join(
    extractedDir,
    "webview",
    "assets",
    LINUX_DESKTOP_SETTINGS_ASSET,
  );
  if (!fs.existsSync(assetPath)) {
    return {
      matched: false,
      changed: 0,
      reason: `${LINUX_DESKTOP_SETTINGS_ASSET} is not present`,
    };
  }

  const source = fs.readFileSync(assetPath, "utf8");
  const patched = applyLinuxDesktopSettingsPatch(source);
  const matched =
    patched !== source ||
    source.includes("class LinuxRealtimeVoiceSpeedSettings extends React.Component");
  if (!matched) {
    return {
      matched: false,
      changed: 0,
      reason: "Linux desktop settings insertion point not found",
    };
  }
  if (patched !== source) {
    fs.writeFileSync(assetPath, patched, "utf8");
  }
  return { matched: true, changed: patched === source ? 0 : 1 };
}

const descriptors = [
  {
    id: "realtime-session-speed",
    phase: "webview-asset",
    order: 20_940,
    ciPolicy: "optional",
    pattern: /^app-initial-[A-Za-z0-9_-]+\.js$/,
    assetMatch: matchesRealtimeVoiceContract,
    missingDescription: "current Realtime WebRTC webview bundle",
    skipDescription: "realtime voice speed runtime patch",
    apply: applyRealtimeVoiceSpeedPatch,
  },
  {
    id: "settings-control",
    phase: "extracted-app:post-webview",
    order: 20_941,
    ciPolicy: "optional",
    apply: patchLinuxDesktopSettingsAsset,
    status: (result, warnings) => ({
      status: result?.changed
        ? "applied"
        : result?.matched
          ? "already-applied"
          : "skipped-optional",
      reason: result?.reason ?? warnings[0] ?? null,
    }),
  },
];

module.exports = {
  DEFAULT_SPEED,
  MAX_SPEED,
  MIN_SPEED,
  SETTINGS_KEY,
  STEP,
  applyLinuxDesktopSettingsPatch,
  applyRealtimeVoiceSpeedPatch,
  clampSpeed,
  descriptors,
  matchesRealtimeVoiceContract,
  patchLinuxDesktopSettingsAsset,
  realtimeRuntimeSource,
};
