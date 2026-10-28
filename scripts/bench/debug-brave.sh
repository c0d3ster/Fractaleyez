#!/bin/bash
# usage: debug-brave.sh   (re)starts the debug Brave (profile C:/brave-debug, port 9222) and sets the app up: mic allowed, window maximized on the left monitor,
# popout open, video in front. Needs PLAYWRIGHT_CORE (path to a playwright-core install) in the environment; needs no one at the keyboard. Only the debug instance is closed; a regular Brave is left alone.
cd "$(dirname "$0")"
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'brave.exe' -and \$_.CommandLine -match 'brave-debug' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" > /dev/null 2>&1
sleep 4
"/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" --remote-debugging-port=9222 --user-data-dir="C:/brave-debug" --use-fake-ui-for-media-stream --window-position=-1900,300 --window-size=1800,940 "$@" about:blank > /dev/null 2>&1 &
for i in $(seq 1 30); do curl -s -m 2 localhost:9222/json/version > /dev/null 2>&1 && break; sleep 1; done
sleep 2
node debug-launch.js
