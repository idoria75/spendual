#!/usr/bin/env bash
# Runs inside the dev container (make dev). Migrates, seeds, then runs backend and frontend.
# Ctrl-C or SIGTERM stops both servers (whole process groups, so node dies too) and exits 0.
# If a server stops on its own, the other one is stopped and the exit code is non-zero.
set -u

npm run generate -w backend || exit $?
npm run migrate -w backend || exit $?
npm run seed -w backend || exit $?

# Each server runs in its own session (setsid), so its pid is also its process group id.
# kill -- -PGID then reaches npm, sh, tsx and node.
pids=()
stopping=0
stop() {
  stopping=1
  local p
  for p in "${pids[@]}"; do kill -TERM -- "-$p" 2>/dev/null || true; done
  # Give them 5 seconds, then kill whatever is left.
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    local alive=0
    for p in "${pids[@]}"; do kill -0 -- "-$p" 2>/dev/null && alive=1; done
    [ "$alive" -eq 0 ] && return 0
    sleep 0.5
  done
  for p in "${pids[@]}"; do kill -KILL -- "-$p" 2>/dev/null || true; done
}
trap 'stopping=1' INT TERM

setsid npm run dev -w backend &
pids+=($!)
setsid npm run dev -w frontend &
pids+=($!)

# A signal interrupts wait. The first server to end also wakes us up.
wait -n
rc=$?
if [ "$stopping" -eq 1 ]; then
  stop
  wait 2>/dev/null || true
  exit 0
fi
# A server ended by itself: failure, even with exit code 0.
stop
wait 2>/dev/null || true
[ "$rc" -ne 0 ] && exit "$rc"
exit 1
