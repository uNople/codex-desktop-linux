#!/bin/sh

codex_desktop_harden_bundled_plugin_ancestors() {
    app_root="${1:-}"
    if [ -z "$app_root" ] || [ ! -d "$app_root" ] || [ -L "$app_root" ]; then
        printf '%s\n' "codex-desktop: refusing invalid app root for plugin permission repair: $app_root" >&2
        return 1
    fi

    for relative_path in \
        resources/plugins \
        resources/plugins/openai-bundled \
        resources/plugins/openai-bundled/plugins; do
        path="$app_root/$relative_path"
        if [ -L "$path" ]; then
            printf '%s\n' "codex-desktop: refusing symlinked plugin directory: $path" >&2
            return 1
        fi
        if [ -e "$path" ] && [ ! -d "$path" ]; then
            printf '%s\n' "codex-desktop: refusing non-directory plugin path: $path" >&2
            return 1
        fi
    done

    for relative_path in \
        resources/plugins \
        resources/plugins/openai-bundled \
        resources/plugins/openai-bundled/plugins; do
        path="$app_root/$relative_path"
        [ -d "$path" ] || continue
        chmod 0755 "$path" || return 1
    done
}
