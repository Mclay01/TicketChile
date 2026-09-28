# Media architecture — M12

## Initial audit (before implementation)

Starting at clean `4b2b5e6` on `astra/ticketchile-v2`; M1–M11 complete.
M5 provides `MediaStore.put/get`, immutable local UUID WebP files, a 5 MiB
streaming limit, Sharp decoding/re-encoding and 24 million pixel protection.
Production local writes fail closed. No production provider is configured in
source, dependency manifests or the environment template.

`POST /api/media` checks event-edit or organizer capability and M3 rate limits.
It writes storage **before** its metadata/audit transaction: a DB failure leaves
an untracked file. It does not compare declared MIME with decoded format.
`GET /api/media/[id]` permits current published references or authorized event/
tenant reads; every response currently proxies local bytes with no-store.
Migration 0005 records only owner, optional event, key, MIME, size and creation.
There are no variants, recovery leases, cleanup jobs, deletion states or migration
checkpoints. M6 saves immutable media references under revision checks, but checks
media membership through the pool outside its transaction.

Legacy raster base64 remains in event image/hero columns. Public event serializers
replace it with publication-checked binary routes; organizer preview has a scoped
equivalent. Neither route has admin review access. M9 event detail omits images.
Next Image wrappers provide stable layout and a placeholder but local API images
are unoptimized; a failed image state survives a source change. CSP allows only
self/data/blob images; no remote image origin is configured.

Organizer editing has file selection and save conflicts, but no upload progress,
file retry or explicit removal. AI edits do not support image generation or image
metadata changes; M12 does not add an AI image provider. Retained/cancelled events
remain database records. No asset retention policy or production scheduler exists.
Existing media tests cover decode/bounds, local immutability, tenant and publication
guards, legacy rendering and event revision boundaries.

## Implementation and verification

**IMPLEMENTED / LOCAL AND CONTRACT TESTED. PRODUCTION CREDENTIALS REQUIRED;
PRODUCTION VALIDATION REQUIRED.** No production resources or data are used.

### Storage and environment contract

`MediaStore` remains the feature boundary: immutable put, get, head (size/MIME/SHA256),
idempotent delete and optional authorized read URL. The local adapter remains for
development; the single production adapter uses AWS SDK v3 against S3 or a compatible
HTTPS endpoint. No client-side SDK, bucket listing, arbitrary upload URL or object
key is accepted. No copy/move is needed. Default production configuration is disabled.

| Environment | Storage and isolation |
|---|---|
| Development | Local `.local/media`, immutable files; production runtime refuses it |
| Preview | Private `ticketchile-preview-*` bucket, `preview/v1/` keys, dedicated credentials |
| Production | Private `ticketchile-production-*` bucket, `production/v1/` keys, separate credentials |

`MEDIA_ENVIRONMENT` must match host `VERCEL_ENV` or independently configured
`APP_ENVIRONMENT`. There is no default S3 bucket or credential-chain fallback.
Rows contain a store identity derived from origin/bucket/namespace; a different
store cannot read or clean those rows. Server-generated keys are
`{stage}/v1/{tenantHash24}/{eventHash24}/{purpose}/{uuid}/{variant}.webp` (local uses
`local/v1`). Names and raw internal identifiers are not embedded. Keys are immutable.
Existing UUID WebP local keys remain readable locally.

Explicit credentials have access only to the environment prefix in one private
bucket: PutObject, GetObject/HeadObject and DeleteObject. Block public access and
ACLs; grant no ListBucket to the application if the provider permits HEAD's missing
object response to remain distinguishable. Some S3 policies return 403 instead of
404 for missing keys without ListBucket: validate this and scope ListBucket to the
prefix when required. Enable TLS/encryption and provider access logging with signed
query redaction. Configure separate backup/version retention. S3-compatible support
for conditional puts, checksums, HEAD and signed response overrides must be certified.

The implementation follows [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
and [PutObject integrity parameters](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html).
Put uses `If-None-Match: *`, SHA256 and immutable metadata. SDK calls have a 3s
connection timeout, 10s request timeout and at most two attempts. Delete is retryable;
on a versioned bucket, [DeleteObject creates a marker](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html)
rather than guaranteeing physical removal. Version expiry remains an operator/retention
decision, not an application promise.

### Upload and delivery

Create a draft first. Upload requires same origin, a fresh event-edit owner/staff
capability, event scope, explicit POSTER/HERO_DESKTOP/HERO_MOBILE purpose and a
16–100 character idempotency key. Client tenant/path/filename claims grant nothing.
Capability and nonclosed event state are rechecked inside intent/finalization
transactions. Admin review is read-only under live `operations.read` plus MFA;
admin upload/removal is not implemented. It can view current event references,
not browse unbound storage. Legacy preview repeats the admin/event SQL policy.

Raw uploads stream under a configurable limit (default/hard maximum 5 MiB).
Sharp checks actual JPEG/PNG/WebP content against declared MIME, integrity,
single-frame format, maximum 24MP and maximum 16,000 pixels per source dimension.
SVG, PDFs, animation and malformed content are rejected. Orientation is applied;
safe WebP re-encoding removes EXIF/GPS/ICC and filenames. No original upload is kept.
Three outputs have longest-edge limits 2400 (hero), 960 (card), 320 (thumb), no
upscaling, qualities 82/80. Very small images may yield equal-sized variants; output
count remains three. Each variant has measured dimensions, bytes and SHA256.

M3 limits uploads/normalization/finalization together to 30 attempts/tenant/hour,
including retries. Default maximum 30 unreferenced live assets/tenant and two
concurrent image-processing tasks/process (configurable 1–4, excess gets retryable
429) bound work. Decoder admission also covers legacy binary reads. This is not a
cross-host memory reservation; hosting concurrency/load must still be validated.

Public serializers expose canonical application media IDs only for published events.
The media GET checks current publication references or live event/tenant permission.
An unreferenced READY draft upload is private. S3 GET returns a **no-store redirect**
to a 60-second signed read URL; bytes go directly to object storage. Private bytes
are no-store; published bytes allow a 60-second cache lifetime. Publication changes
only access checks, never keys or storage bytes. Already issued URLs/cache copies
can outlive unpublication briefly; screenshots/downloaded bytes cannot be recalled.
No public-bucket policy or indefinite public URL is introduced. An external CDN
is optional future infrastructure, not implemented/certified here.

CSP adds only the exact configured HTTPS delivery origin. Next's remotePatterns
remain empty because `/api/media` picture sources deliberately use precomputed
variants and bypass the remote optimizer. Remote user URLs remain rejected.
Build and runtime must use the same media origin for Next header configuration.
Cards are lazy; real heroes are eager/high priority; mobile heroes select card
resolution, desktop heroes select hero resolution. Editor previews use thumbs.
Fixed source variants avoid inaccurate width descriptors for portrait/small inputs
and avoid preloading an unused desktop image. Stable wrappers and the existing
placeholder handle failures, including a source change after a previous error.

### Failure-safe lifecycle and concurrency

0011 extends existing metadata and adds variant and adoption tables. An UPLOADING
intent plus every expected key is committed **before** storage writes. Serialized
retries verify existing object metadata and fill missing variants; only verified
completion and audit commit READY. Storage success/DB rollback therefore leaves
a discoverable intent. Initial DB failure writes nothing; storage failure never
creates an attachable asset. Same request key with changed scope/content conflicts.
Re-encoding changes after a library upgrade require a new key, not overwritten bytes.

M6 revision checks still control the event save. A new READY asset must match the
tenant, event and slot (legacy null-purpose/unbound rows retain compatibility).
Media membership checks run on the save transaction and lock the asset. New asset
first, event save second; failures preserve the prior event reference and bytes.
Replacement/removal audits record field names, never images or signed URLs.

A database reference trigger locks assets in stable order, refuses non-READY
attachments, and tracks detachment time. It covers internal event writers too.
Cleanup commits DELETING under the same row lock, then deletes outside the global
inventory lock. This prevents a concurrent save or upload retry from resurrecting
an asset being deleted. Network work holds only that asset's row transaction.
Failed deletion/final DB commit retains the tombstone and retries idempotently.

`cleanupMedia({limit:25})` is an internal worker, maximum batch 100. It observes a
bounded set of detached records, waits default seven days (minimum 24 hours), and
rechecks **all** current event references regardless of publication/lifecycle plus
PENDING/APPLIED adoption pins before deletion. Retained/ended/cancelled event media
is never automatically removed. Failed deletes back off ten minutes; outcomes and
closed error codes persist. No bucket scan or arbitrary key deletion is supported.
Pre-M12 untracked filesystem orphans are not discovered by this metadata worker;
reconcile a filesystem inventory separately, read-only first. Retention periods for
events, adoption originals and provider versions require business/legal approval.

### Legacy adoption and recovery

`adoptLegacyMedia` defaults to dry run. It scans bounded event/slot batches using an
opaque keyset checkpoint, validates legacy data, persists the source checksum and
original value privately, uses deterministic upload idempotency, then reads and
checks every stored variant's actual bytes. Only afterward can a locked revision /
original-value comparison replace that field and increment revision. Slugs, event
URLs, publication state and other metadata are untouched. Draft assets stay private.
Concurrent edits create CONFLICT, never silent overwrite. Failure reports contain
event/slot/checksum/outcome, not raw data, credentials, signed URLs or provider errors.
APPLIED adoption mappings pin the asset for rollback until a reviewed retention
decision; failure/conflict mappings retain originals too.

Local rehearsal: set only a loopback `MIGRATION_DATABASE_URL` with a
`ticketchile_test*`/`ticketchile_local*` database, then from apps/web run:

```
node scripts/media-local.mjs adopt --limit=10 --checkpoint=inspect
node scripts/media-local.mjs adopt --apply --limit=10 --checkpoint=apply
node scripts/media-local.mjs cleanup --apply --limit=25
```

Checkpoints live under ignored `.local` and bind mode/database. Repeat the apply
command to resume; restart without a checkpoint to retry logged failures/conflicts
after review. Each batch is at most 50 slots; successful rows no longer match base64
input. The local CLI rejects remote DBs, production mode and S3 configuration. It
does not load `.env` files. The internal services are the production worker boundary;
the CLI is a guarded rehearsal harness, not a production migration executor.

Before production adoption: snapshot DB/media, test restore, validate 0011 against
the actual catalog, rehearse on a sanitized clone in dedicated preview storage,
review dry-run counts/errors/quotas, confirm private/public/admin access and compare
checksums. Choose a bounded private worker schedule, monitor failures and stop on
conflicts. Pause cleanup during initial adoption review. Rollback only the specific
field still referencing the mapped asset, under event revision/asset row locks, by
restoring retained `original_value` and incrementing revision; never overwrite an
intervening edit. Verify legacy rendering before considering asset cleanup. Do not
drop 0011 tables or legacy readers as rollback. Original-data purge and existing
local-object copying into S3 remain separately reviewed operational work.

## M13 operational certification addendum

No dedicated preview S3 bucket/key was available; adapter status remains implemented
and locally contract-tested, with **EXTERNAL VALIDATION REQUIRED**. The M13 local
restore rehearsal exercises dry-run/no-write behavior, one-slot adoption, deterministic
replay, retained originals and checksums after DB restore. Full lifecycle tests and
focused real-browser upload/private/public/replacement/failure regressions rerun.

`MEDIA_UPLOADS_ENABLED=false` rejects persistMedia before normalization/DB/object writes,
including internal adoption, while configured reads keep working. Stop cleanup/adoption
scheduling separately during an incident; a call already executing may finish.
`MEDIA_PROVIDER=disabled` disables both reads and writes. `runWorkerBatch('media',25)`
is the trusted bounded/session-locked wrapper, not an HTTP scheduler. Provider/IAM/
versioned deletion/cache/CSP/backup validation and installation remain pending; follow
[PROVIDER-CERTIFICATION.md](PROVIDER-CERTIFICATION.md) and [STAGING-RUNBOOK.md](STAGING-RUNBOOK.md).
