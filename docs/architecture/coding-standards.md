# 19. Coding Standards — CampusAR

Standards for teams implementing against this architecture. No sample application feature code here — conventions only.

---

## Folder naming

| Area | Convention |
|------|------------|
| Apps | `apps/<name>` lowercase |
| Packages | `packages/<name>` |
| Features (FE) | `features/<featureName>/` camelCase folder OK; prefer kebab if team standardizes |
| Backend layers | `domain`, `application`, `infrastructure`, `interfaces` |
| Tests | Colocate `*.test.ts` next to unit under test |

---

## File naming

| Kind | Pattern |
|------|---------|
| React components | `PascalCase.tsx` |
| Hooks | `useSomething.ts` |
| Stores | `somethingStore.ts` |
| Services | `somethingService.ts` |
| Repositories | `somethingRepository.ts` |
| Types | `types.ts` or `something.types.ts` |
| Docs | `kebab-case.md` |

---

## TypeScript conventions

- `strict` true in shared tsconfigs
- Prefer `unknown` over `any`; narrow with type guards
- Shared DTOs in `packages/shared` — do not duplicate conflicting enums
- Explicit return types on exported public functions (recommended for API layer)
- No default exports except React lazy components if needed
- Prefer `as const` enums/unions for event types and roles

---

## Error handling

- Throw / return **typed domain errors** in backend; map at HTTP edge
- Frontend: map `error.code` to user strings; log unexpected
- Never empty `catch` blocks
- Async: handle rejections at UI boundary

---

## Logging

- Structured JSON in API production logs
- Include `requestId`, level, message, selective context
- Forbidden: passwords, tokens, full auth headers, precise SOS payloads in open logs
- Frontend: thin wrapper for future telemetry; avoid `console.log` spam in production builds

---

## Testing strategy

| Layer | Expectation |
|-------|-------------|
| Domain routing | Fixture graphs covering MoSCoW safety/crowd/access cases — **required** |
| Application services | Fakes for repos/ports |
| HTTP | Smoke/integration with test DB in CI when available |
| Frontend unit | Geo/snap, nav state machine, permission flows |
| E2E | Critical guest path on staging |

Coverage: prefer critical paths over vanity %.

---

## Git workflow

| Practice | Rule |
|----------|------|
| Branching | `feature/*`, `fix/*` from `main` |
| Commits | Imperative, focused; why over noise |
| PRs | Small; link product/architecture sections when relevant |
| Reviews | Require CI green; architecture-impacting changes need lead ack |
| Secrets | Never commit `.env` |
| Hooks | Do not skip unless emergency + follow-up |

---

## Documentation standards

- Product changes → update `docs/product` first
- Architecture changes → update `docs/architecture` in same PR
- Public HTTP surface → OpenAPI must match behaviour
- Assumptions labeled **Assumption:**
- Prefer Mermaid for flows over undocumented tribal knowledge

---

## API / FE contract hygiene

- Additive JSON fields OK; breaking changes need versioning
- Shared zod/types where practical
- WS event types versioned via `protocolVersion`

---

## Performance hygiene

- No unbounded arrays in hot WS handlers
- Avoid N+1 DB access in repositories
- Lazy-load heavy FE modules (AR, twin, admin)
- Stop geolocation watches when unused

---

## Security hygiene (eng checklist)

- [ ] New admin route has RBAC test
- [ ] New user input validated
- [ ] No secret in client bundle
- [ ] Dependency audit on release

---

## Accessibility hygiene (FE)

- Critical instructions available as text
- Honor reduced motion for AR doll
- Forms labeled; focus visible

---

## Definition of done (implementation)

1. Meets acceptance criteria in product feature specs  
2. Fits layer/port boundaries in architecture  
3. Tests for domain-critical behaviour  
4. Docs updated if contracts changed  
5. CI green  
