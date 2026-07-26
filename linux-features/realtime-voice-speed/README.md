# Realtime voice speed

Optional Linux feature that adds **Settings -> Linux desktop -> Realtime voice**
with a native speech-speed slider.

- Default: `1.50x`
- Range: `0.25x` to `1.50x`
- Step: `0.05x`
- Storage key: `codex-linux-realtime-voice-speed`

The current `thread/realtime/start` app-server schema does not expose Realtime's
numeric `speed` field. This feature leaves that schema alone. After the WebRTC
session starts, it sends:

```json
{
  "type": "session.update",
  "session": {
    "audio": {
      "output": {
        "speed": 1.5
      }
    }
  }
}
```

The update travels over the existing Realtime data channel. Slider changes are
also sent to the active session, so they take effect between turns without
pitch-shifting.

OpenAI documents `1.0` as the API default, `0.25` as the minimum, `1.5` as the
maximum, and permits speed changes only between turns:

<https://developers.openai.com/api/reference/resources/realtime/subresources/sessions/methods/create>

Enable locally:

```json
{
  "enabled": [
    "realtime-voice-speed"
  ]
}
```

The feature is disabled by default. Patch drift is fail-soft in upstream CI and
rejects local candidate promotion when this enabled feature cannot find its
current Realtime or Linux settings insertion point.
