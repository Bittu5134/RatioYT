#!/usr/bin/env bash
#
# Start Firefox so the `firefox-devtools` MCP server can attach to it.
#
# The MCP server runs in "connect-existing" mode, which means it does NOT launch
# Firefox itself. It attaches to a Firefox that you start with BOTH:
#
#   --marionette               WebDriver Classic, listened on 127.0.0.1:2828
#   --remote-debugging-port    WebDriver BiDi,    listened on 127.0.0.1:9222
#
# Both are required. With only --marionette the MCP server cannot connect and
# asks you to restart Firefox.
#
# Usage:
#   ./scripts/firefox-mcp.sh [url]        # default url: about:blank
#   FIREFOX_MCP_PROFILE=default-release ./scripts/firefox-mcp.sh
#
# Env:
#   FIREFOX_MCP_PROFILE  Profile name to use (default: firefox-mcp)
#   BIDI_PORT            WebDriver BiDi port (default: 9222)
#
# Notes:
#   * Firefox runs one process per profile, so the dedicated `firefox-mcp`
#     profile coexists with your everyday Firefox.
#   * If Firefox is ALREADY running with the same profile, these flags are
#     ignored: the command just opens a new window and Marionette never starts.
#     Quit that profile first, or use the dedicated profile (the default here).
#   * Never leave Marionette enabled for normal browsing: it sets
#     navigator.webdriver = true and changes fingerprint signals, which trips
#     bot detection on Cloudflare/Akamai-protected sites.

set -euo pipefail

PROFILE="${FIREFOX_MCP_PROFILE:-firefox-mcp}"
BIDI_PORT="${BIDI_PORT:-9222}"
MARIONETTE_PORT="${MARIONETTE_PORT:-2828}"
START_URL="${1:-about:blank}"

# Firefox's own Marionette port comes from the `marionette.port` pref, not a CLI
# flag. 2828 is the default and matches the MCP config, so nothing to do unless
# you override it.
if [ "$MARIONETTE_PORT" != "2828" ]; then
  echo "warning: MARIONETTE_PORT=$MARIONETTE_PORT, but the MCP is configured for 2828." >&2
  echo "         Set --marionette-port $MARIONETTE_PORT in ~/.pi/agent/mcp.json." >&2
fi

# profiles.ini lives in the XDG config dir on modern Linux, the legacy dir elsewhere.
find_profiles_ini() {
  local candidate
  for candidate in \
    "${XDG_CONFIG_HOME:-$HOME/.config}/mozilla/firefox/profiles.ini" \
    "$HOME/.mozilla/firefox/profiles.ini"; do
    [ -f "$candidate" ] && { printf '%s' "$candidate"; return 0; }
  done
  return 1
}

# Create the dedicated profile on first run. -CreateProfile is not idempotent:
# running it for an existing name adds a duplicate entry, so check first.
profiles_ini="$(find_profiles_ini || true)"
if [ -z "$profiles_ini" ] || ! grep -qx "Name=$PROFILE" "$profiles_ini"; then
  echo "Creating Firefox profile '$PROFILE'..."
  firefox -CreateProfile "$PROFILE"
fi

# Already listening? Then a suitable Firefox is up and this just opens a window.
if ss -ltn 2>/dev/null | grep -q "127.0.0.1:$MARIONETTE_PORT"; then
  echo "Marionette already listening on $MARIONETTE_PORT - reusing the running instance."
elif pgrep -x firefox >/dev/null 2>&1 && [ "$PROFILE" != "firefox-mcp" ]; then
  echo "warning: Firefox is already running. If it uses profile '$PROFILE', the" >&2
  echo "         --marionette/--remote-debugging-port flags will be ignored." >&2
  echo "         Quit that Firefox first, or use the dedicated firefox-mcp profile." >&2
fi

echo "Starting Firefox: profile=$PROFILE bidi=$BIDI_PORT marionette=$MARIONETTE_PORT"
exec firefox -P "$PROFILE" --marionette --remote-debugging-port "$BIDI_PORT" "$START_URL"
