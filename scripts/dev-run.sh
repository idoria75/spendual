#!/usr/bin/env bash
# Runs inside the dev container (make dev). Migrates, seeds, then runs backend and frontend.
# Ctrl-C or SIGTERM stops both servers and exits 0. If a server stops on its own, exit non-zero.
set -u

npm run migrate -w backend || exit $?
npm run seed -w backend || exit $?

pids=()
stopping=0
stop() {
  stopping=1
  kill -TERM "${pids[@]}" 2>/dev/null || true
}
trap stop INT TERM

npm run dev -w backend &
pids+=($!)
npm run dev -w frontend &
pids+=($!)

# First server to end (or a signal) wakes us up.
wait -n
rc=$?
if [ "$stopping" -eq 0 ]; then
  # A server ended by itself: that is a failure, even with exit code 0.
  stop
  wait || true
  [ "$rc" -ne 0 ] && exit "$rc"
  exit 1
fi
wait || true
exit 0
