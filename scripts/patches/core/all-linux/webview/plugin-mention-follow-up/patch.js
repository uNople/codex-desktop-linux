"use strict";

const {
  webviewAssetPatch,
} = require("../../../../descriptor.js");
const {
  applyPluginMentionFollowUpQueuePatch,
} = require("../../../../impl/webview/index.js");

module.exports = webviewAssetPatch({
  id: "plugin-mention-follow-up-context",
  phase: "webview-asset",
  order: 1052,
  ciPolicy: "required-upstream",
  pattern: /^app-initial-[^.]+\.js$/,
  missingDescription: "composer follow-up webview bundle",
  skipDescription: "active-turn plugin mention follow-up context patch",
  apply: applyPluginMentionFollowUpQueuePatch,
});
