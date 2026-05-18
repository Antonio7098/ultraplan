# Repo Analysis: k9s

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `13-security` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

K9s is a Kubernetes CLI tool that provides a terminal-based UI for cluster management. Security analysis reveals a mature tool with explicit trust boundaries, plugin sandboxing via scope restrictions, a read-only mode for untrusted environments, and input validation at multiple layers. Shell execution is controlled through kubectl exec patterns with optional node-shell pod deployment. Secrets are handled through Kubernetes native APIs (kubeconfig), not stored by k9s itself.

## Rating

**7/10** — Good operational safety. Trust boundaries are explicit (readOnly mode, Dangerous plugin flag, scopes), input validation is centralized via JSON schema validation for plugins/aliases/hotkeys, and shell execution is controlled through controlled kubectl invocations. Slightly lower due to the nature of being a Kubernetes cluster management tool where the threat model inherently involves privileged operations.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Input validation | `isValidInputRune()` filters control characters and escape sequences in command prompt | `internal/ui/prompt.go:306-313` |
| Input validation | JSON Schema validation for plugin configs using gojsonschema | `internal/config/json/validator.go:146` |
| Input validation | Plugin `Validate()` checks duplicate input names, type-specific validation for defaults | `internal/config/plugin.go:83-112` |
| Input validation | `sanitizeEsc()` function for clipboard operations | `internal/view/helpers.go:50-52` |
| Input validation | Plugin input dialog requires mandatory fields before execution | `internal/ui/dialog/plugin_inputs.go:128-145` |
| Shell execution | `exec.CommandContext` for kubectl execution | `internal/view/exec.go:200,279` |
| Shell execution | Shell pod launched via controlled kubectl exec on node | `internal/view/exec.go:460-538` |
| Shell execution | Plugin execution via `executePlugin()` with env substitution | `internal/view/actions.go:206-257` |
| Shell execution | `runK()` validates kubectl is not in current working directory | `internal/view/exec.go:59-61` |
| Secret handling | kubeconfig loaded via Kubernetes client-go, not stored by k9s | `internal/view/helpers.go:98` |
| Secret handling | Context credentials accessed via `client.Config()` impersonation | `internal/view/exec.go:66-71,252-257` |
| Trust boundaries | `readOnly` mode controls write operations | `internal/config/k9s.go:43` |
| Trust boundaries | `Dangerous` flag on plugins blocks execution in readOnly mode | `internal/view/actions.go:142` |
| Trust boundaries | `PluginInput.Required` fields enforced before plugin execution | `internal/config/plugin.go:48` |
| Trust boundaries | `Scopes` on plugins restrict which views can invoke them | `internal/config/plugin.go:55` |
| Trust boundaries | `ShouldConfirm()` triggers confirmation dialog for plugins with inputs | `internal/config/plugin.go:74-80` |
| Trust boundaries | Node shell requires `FeatureGates.NodeShell` enabled | `internal/view/exec.go:386` |

## Answers to Protocol Questions

### 1. How are secrets stored?

K9s does not store secrets directly. It relies on Kubernetes' native authentication mechanisms:

- **kubeconfig**: K9s uses the standard kubeconfig file (`~/.kube/config` or `KUBECONFIG` env var) for cluster authentication (`internal/view/helpers.go:98`)
- **ServiceAccount tokens**: When running inside a cluster, k9s uses in-cluster service account credentials
- **Credential impersonation**: Supports `--as` and `--as-group` flags for impersonation (`internal/view/exec.go:66-71`)
- **No secret caching**: K9s reads secrets from the API server on demand; it does not cache or store them locally

Evidence: `internal/view/helpers.go:75-108` shows `k8sEnv()` function that only reads context/cluster/user info from config, not credentials themselves.

### 2. How is shell execution sandboxed?

Shell execution is controlled and layered:

**Plugin execution** (`internal/view/exec.go:57-97`):
- `runK()` first validates kubectl is in PATH and NOT in the current working directory (prevents binary substitution attacks)
- Appends impersonation args, context, and kubeconfig from k9s' connection config
- Executes kubectl with controlled arguments

**Node shell** (`internal/view/exec.go:300-454`):
- Launches a separate pod (by default `busybox:1.37.0`) on the target node
- The pod runs with `HostNetwork: true`, `HostPID: true`, privileged security context
- Mounts `/` from host as `root-vol` read-only
- Optional additional hostPath volumes (e.g., Docker socket)
- This is a significant privilege escalation but is required for node debugging

**Plugin commands** (`internal/view/actions.go:206-257`):
- Plugins are validated against JSON schema before loading
- `Dangerous` plugins are blocked in readOnly mode
- Environment substitution happens via `env.Substitute()` but appears to use simple replacement
- No shell interpolation in plugin args

**Shell pod configuration** (`internal/config/shell_pod.go:16-27`):
- Default image is `busybox:1.37.0`
- Resource limits enforced (CPU, memory)
- ImagePullPolicy configurable
- Labels configurable

### 3. How are user inputs validated?

Multiple validation layers exist:

**1. Command prompt input** (`internal/ui/prompt.go:155-162`):
```go
if isValidInputRune(r) {
    p.model.Add(r)
}
```
Filters terminal escape sequences and control characters.

**2. Plugin input validation** (`internal/config/plugin.go:83-112`):
- Duplicate input names prohibited
- Dropdown defaults must be in options list
- Bool defaults must be "true" or "false"
- Number defaults must parse as floats

**3. Required field enforcement** (`internal/ui/dialog/plugin_inputs.go:128-145`):
```go
if input.Type != config.InputTypeBool && val == "" {
    missing = append(missing, input.Name)
}
```

**4. JSON Schema validation** (`internal/config/json/validator.go:146`):
All plugin configs validated against JSON schemas before loading.

**5. YAML parsing** (`internal/config/plugin.go:167-204`):
Uses `yaml.NewDecoder` with `KnownFields(true)` to catch unknown fields.

### 4. Are trust boundaries explicit?

Yes, several explicit trust boundary mechanisms:

| Mechanism | Location | Purpose |
|-----------|----------|---------|
| `readOnly: true` in config | `internal/config/k9s.go:43` | Global read-only mode |
| `Dangerous` plugin flag | `internal/config/plugin.go:64` | Marks destructive operations |
| `scopes` on plugins | `internal/config/plugin.go:55` | Restricts plugin availability |
| `ShouldConfirm()` | `internal/config/plugin.go:74-80` | Prompts before executing plugins with inputs |
| `FeatureGates.NodeShell` | `internal/view/exec.go:386` | Enables/disables node shell |
| ReadOnly table mode | `internal/ui/table.go:57,94-99` | Disables write actions in UI |

**Dangerous plugin behavior** (`internal/view/actions.go:142`):
```go
if !inScope(pp.Plugins[k].Scopes, aliases) || (ro && pp.Plugins[k].Dangerous) {
    continue
}
```
In read-only mode, dangerous plugins are skipped entirely.

## Architectural Decisions

1. **Plugin architecture via YAML**: K9s uses YAML files for plugin definitions, allowing users to extend functionality without code changes. This is powerful but requires validation to prevent injection.

2. **Node shell via privileged pod**: Rather than accessing nodes directly, k9s spawns a privileged pod (`internal/view/exec.go:460-538`) with `HostNetwork: true` and `HostPID: true`. This is a deliberate security trade-off to enable node debugging while isolating the host from k9s process.

3. **Feature gates pattern**: Node shell requires `FeatureGates.NodeShell: true` in config, providing an opt-in mechanism for privileged features.

4. **Kubernetes native auth**: K9s delegates credential management to Kubernetes client-go, avoiding custom secret storage.

## Notable Patterns

1. **Schema-first validation**: All user-provided configs (plugins, aliases, hotkeys, views, skins) validated against JSON schemas before parsing (`internal/config/json/validator.go:119-132`).

2. **Confirmation dialogs**: Plugins with inputs or `Confirm: true` show a confirmation dialog before execution (`internal/view/actions.go:258-263`).

3. **Environment substitution**: Plugin arguments support `$VAR` substitution from kubernetes context (`internal/view/actions.go:213-221`).

4. **Read-only enforcement**: Multiple layers - config flag, context override, CLI flags, table-level toggle.

5. **Dangerous action binding**: Destructive actions (delete, scale, restart) marked as `Dangerous: true` and disabled in read-only mode.

## Tradeoffs

| Tradeoff | Rationale | Risk |
|----------|-----------|------|
| Node shell uses privileged pod | Required for node access; not running as root on host | Pod escape could give node access |
| HostPath volume mounting | Enables Docker socket access for debugging | Container breakout gives host access |
| `HostNetwork: true` for shell pod | Required for node network access | Potentially broad network access |
| `HostPID: true` for shell pod | Required to see host processes | Process visibility/control |
| Plugin YAML with env substitution | Flexibility for users | Potential for injection if env vars untrusted |

## Failure Modes / Edge Cases

1. **Kubectl in CWD**: `runK()` checks for kubectl not being in current working directory (`internal/view/exec.go:59-61`) to prevent binary substitution. If violated, returns error `kubectl command must not be in the current working directory`.

2. **Plugin schema validation failure**: Invalid plugins logged and skipped with warning (`internal/config/plugin.go:160-164`).

3. **Shell pod launch failure**: Retries up to 50 times with 2-second delay; if pod never reaches Running state, returns error (`internal/view/exec.go:423-453`).

4. **Missing required inputs**: Plugin execution blocked until all required inputs provided (`internal/ui/dialog/plugin_inputs.go:130-145`).

5. **Node shell feature gate disabled**: If `FeatureGates.NodeShell` is false, `nukeK9sShell()` returns nil without action (`internal/view/exec.go:386-388`).

6. **Context switching during operations**: Uses mutex locks on context switching (`internal/config/k9s.go:87-98`) to prevent race conditions.

## Future Considerations

1. **Plugin isolation**: Consider sandboxing plugins in separate processes with limited syscall filters.

2. **Audit logging**: No evidence found of security event logging (failed auth, dangerous operations). Could add audit trail.

3. **Secret masking in logs**: K9s logs commands via slog; if sensitive data in args, could leak. Evidence: `internal/view/exec.go:201` logs command via `slog.Debug("Exec command", slogs.Command, opts)`.

4. **Input sanitization for env substitution**: The `env.Substitute()` function is used but no evidence of sanitization for injection (e.g., `$(whoami)` in values).

## Questions / Gaps

1. **No evidence of secret masking in UI**: Secret values in Kubernetes secrets viewer (`internal/view/secret.go:61`) show `Error decoding secret` on decode failure, but is secret data redacted in logs/debug output?

2. **Plugin input sanitization**: Do plugin inputs with special characters get escaped before being passed to shell commands?

3. **No evidence of syscall filtering**: Node shell pod runs privileged; could consider seccomp or AppArmor profile.

4. **Audit trail**: No evidence found of security audit logging for dangerous operations.

5. **Image scanning credentials**: `img_scan.go` runs `trivy` or `docker` commands; how are image pull credentials passed?

---

Generated by `study-areas/13-security.md` against `k9s`.