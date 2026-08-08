"use strict";

const {
  webviewAssetPatch,
} = require("../../../../descriptor.js");
const {
  applySubagentNicknameMetadataPatch,
  applySubagentPanelHistoryHydrationPatch,
} = require("../../../../impl/webview/index.js");

module.exports = [
  webviewAssetPatch({
    id: "subagent-nickname-metadata-shape",
    phase: "webview-asset",
    order: 1050,
    ciPolicy: "required-upstream",
    pattern: /^app-initial-[^.]+\.js$/,
    missingDescription: "subagent metadata webview bundle",
    skipDescription: "subagent nickname metadata shape patch",
    apply: applySubagentNicknameMetadataPatch,
  }),
  webviewAssetPatch({
    id: "subagent-panel-history-hydration",
    phase: "webview-asset",
    order: 1051,
    ciPolicy: "required-upstream",
    pattern: /^local-conversation-page-[^.]+\.js$/,
    missingDescription: "local conversation page webview bundle",
    skipDescription: "subagent panel empty-history fallback patch",
    apply: applySubagentPanelHistoryHydrationPatch,
  }),
];
