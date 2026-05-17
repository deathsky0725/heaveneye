# Bug Report: MiniMax stream stall + rebuild failure causes infinite worker hang

**Repo:** [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
**Version observed:** v0.13.0 → v0.14.0 (persists across update)
**Environment:** macOS 26.5, Apple Silicon, Python 3.11.15
**Provider:** `minimax` (API key auth via `MINIMAX_API_KEY`), `base_url: https://api.minimax.io/anthropic`, `model: MiniMax-M2.7`

## Summary

When MiniMax-M2.7 streaming response stalls (server stops sending chunks mid-conversation), Hermes correctly detects it via `chat_completion_helpers.py` stale-stream timer and attempts to rebuild the OpenAI SDK client via `_replace_primary_openai_client`. However, the rebuild fails with:

```
Failed to rebuild shared OpenAI client (stale_stream_pool_cleanup) … 
provider=minimax base_url=https://api.minimax.io/anthropic model=MiniMax-M2.7 
error=The api_key client option must be set either by passing api_key to the client 
or by setting the OPENAI_API_KEY environment variable
```

The rebuild failure leaves the worker session unable to recover. Worker process stays alive but cannot make further API calls. In kanban-worker mode this manifests as a hung task that eventually times out (`pid not alive` from dispatcher's perspective when claim expires).

## Reproduction

1. Configure profile with MiniMax provider:
   ```yaml
   model:
     default: MiniMax-M2.7
     provider: minimax
     base_url: https://api.minimax.io/anthropic
   ```
2. Set `MINIMAX_API_KEY` via Hermes `.env` (Token Plan Key format `sk-cp-...`)
3. Run a kanban-worker session that accumulates context > ~10k tokens:
   ```
   hermes -p <profile> --skills kanban-worker chat -q work kanban task <id>
   ```
4. Wait. After context grows past ~10k tokens, MiniMax server begins to drop streams mid-response (no error response, no close frame — just stops sending chunks).
5. Hermes detects stale stream after 180s threshold, attempts rebuild → fails.

**Observed reliably across:** 5+ separate sessions today (different profiles: anmaioyi, yefan, shihao). Reproduces 100% when context > ~10k tokens.

## Evidence (logs)

```
2026-05-17 22:08:04 WARNING agent.chat_completion_helpers:
  Stream stale for 527s (threshold 180s) — no chunks received.
  model=MiniMax-M2.7 context=~34,699 tokens. Killing connection.

2026-05-17 22:08:04 WARNING run_agent:
  Failed to rebuild shared OpenAI client (stale_stream_pool_cleanup)
  thread=Thread-2 (run_agent):6179647488
  provider=minimax base_url=https://api.minimax.io/anthropic model=MiniMax-M2.7
  error=The api_key client option must be set either by passing api_key to the client
  or by setting the OPENAI_API_KEY environment variable
```

Tested contexts at stall: 9,045 / 10,602 / 25,330 / 34,699 tokens — all stalled. Smaller sessions (<5k tokens, ~2 min runtime) complete successfully without stall.

## Root cause hypothesis

`_replace_primary_openai_client` in `run_agent.py:2443` calls `_create_openai_client(self._client_kwargs, …)` where `self._client_kwargs` is the dict cached at initial client construction.

For the `minimax` provider, auth uses a custom `x-api-key` header (per MiniMax API docs at https://platform.minimax.io/docs) — not the OpenAI SDK's native `api_key` param. The initial client may construct successfully via `default_headers={'x-api-key': KEY}` while passing `api_key=` empty/dummy. The OpenAI SDK accepts this initially when `default_headers` is present.

However, on rebuild, **something in `client_kwargs` drops the `api_key` value** (or `default_headers`), so the SDK validator falls through to its default check for the `OPENAI_API_KEY` env var — which isn't set for MiniMax users — and raises.

(I have not been able to confirm which kwarg gets dropped without instrumenting `agent_runtime_helpers.create_openai_client`. The dict-copy guard there (`client_kwargs = dict(client_kwargs)` at line 100 from the #10933 fix) prevents mutation but doesn't address kwargs missing at the source.)

## Suggested fix

In `_replace_primary_openai_client` or `create_openai_client`, before constructing the new SDK client, ensure `client_kwargs.api_key` is non-empty when provider is `minimax`/`minimax-cn`:

```python
# When provider needs custom header auth (x-api-key) but the OpenAI SDK
# still requires a non-empty api_key field, mirror the header value.
if agent.provider in {"minimax", "minimax-cn"}:
    if not client_kwargs.get("api_key"):
        client_kwargs["api_key"] = os.environ.get("MINIMAX_API_KEY") or "sk-placeholder"
```

Or, more robustly, pull the credential resolution from `credential_pool.py` (which already knows how to fetch MINIMAX_API_KEY for the `minimax` provider) at rebuild time, not just init.

## Impact

- All multi-step agent sessions with MiniMax-M2.7 hit this wall as context accumulates
- Workers consume kanban claim slots until expiry (~30 min) — blocking pipeline
- Manual intervention (`kill PID + kanban complete`) required per stall
- For multi-agent orchestration (kanban-worker), this is severe — every long task fails

## Workaround (user-side)

When stall is detected:
```bash
kill -9 <worker_pid>
hermes kanban complete <task_id>    # accept whatever code landed before stall
# then continue with next task
```

This loses the rest of the session but preserves committed work.

## Related fixes already applied (and what was/wasn't fixed by them)

Today I went through several rabbit holes before identifying this as the real bug:

1. **Symlinked `~/.hermes/.env` into each `~/.hermes/profiles/<name>/.env`** — fixed the 401 errors (Hermes was reading the wrong `.env` path under launchd-managed gateway daemons because plist sets `HERMES_HOME=profile_dir` and `env_loader.py` looks for `$HERMES_HOME/.env`). This is a *separate* bug worth filing too.

2. **Switched all profile configs from `provider: minimax-oauth` → `provider: minimax`** — minimax-oauth path was sending OAuth Bearer but MiniMax server requires `X-Api-Key`. After switch, 401s went away cleanly. (Maybe rename `minimax-oauth` to something less authoritative since real auth is API key?)

3. After 1 + 2, sessions still stall as described above — the rebuild bug is independent of auth path.

## Reporter notes

- Happy to share full session logs / `errors.log` excerpts off-thread if useful
- Can attach a minimal reproducer script if a maintainer wants
- Open to PR'ing the fix once a maintainer confirms preferred approach (kwargs patch in `_replace_primary_openai_client` vs. credential resolution at rebuild time)
