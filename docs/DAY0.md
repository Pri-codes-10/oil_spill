# Day 0 — closing it out

**Roles are settled:** B1 = ingest · B2 = drift · B3 = attribution

Day 0 exists so three people can work in parallel without colliding. The
*artifacts* mostly exist already — they arrived with the bundle import — but
that is not the same as three people having agreed them. Two of us have never
touched the repo. This page closes that gap.

Total time: **20 minutes together, plus two account signups.**

---

## 0. Before the meeting

### Everyone: run preflight and paste the output into chat

```bash
cd backend
python scripts/preflight.py B1      # or B2 / B3 -- your own role
```

This is the whole point of the script: it turns "did you finish day 0?" into
evidence instead of trust. Paste the full output, failures included. A failure
is information, not an embarrassment.

Three things it deliberately **cannot** check — confirm these by eye:

| Item | Where to check |
|---|---|
| your git email is *registered on GitHub* | GitHub → Settings → Emails |
| `main` is branch-protected | GitHub → Settings → Branches |
| CMEMS / ERA5 registration cleared | your inbox |

### B2: merge `be/b2/metocean-seam` first

Until it lands, preflight reports one hard failure for everyone
(`backend/.gitignore` still excludes the `cache/` directory, so B3's
`cache/.gitkeep` cannot be tracked). Merging makes the report green, so do it
before asking two people to run the script.

### B1: enable branch protection — only you can

All three of us are collaborators, so **anyone can currently push straight to
`main`.** That is how a 160 MB virtualenv reached `main` once already. You own
the repo, so this setting is yours:

GitHub → Settings → Branches → Add rule for `main`:
- require a pull request before merging
- require **1** approval
- *(optional)* require conversation resolution

We keep working through PRs regardless — this just makes the rule real rather
than a promise.

### B3: create your aisstream account — ten minutes, do it today

```bash
cd backend
cp .env.example .env        # then paste your key into AISSTREAM_KEY=
```

Free, sign in with GitHub. **This is the one task where being late is
permanent:** the collector's entire value is elapsed time — recorded AIS
accumulating while we sleep. Every day it is not running is a day of data we
cannot retrieve later. The demo itself uses synthetic AIS, so this is for the
finale, not for tomorrow.

`.env` is gitignored. Never commit it, never paste the key in chat. If it ever
reaches a pushed commit, rotate it at aisstream.io *first* — deleting the
commit does not un-leak it.

### B1: start the Sentinel-1 download — it is slow

A real SAFE GRD product, several GB, into `backend/data/`. **Every other stage
in this pipeline has a fallback. This one does not.** Start it before the
meeting so it downloads while we talk.

---

## 1. The meeting — 20 minutes, all three

The only agenda item that genuinely needs all of us in one place.

### (a) Read `app/contracts.py` aloud — 10 min

Open it and read it together. It is already better than what our own plan asked
for: `validate_contract1`, `validate_contract2`, and asserts that corridor
radius grows monotonically with `hours_ago`. But **two of us have never read
it**, and it was authored by neither B3 nor jointly.

The question for each of us is not "is this fine?" but **"does this give me
what I need, and does it constrain me anywhere I cannot live with?"**

### (b) B2 + B3 settle Contract 2 — 8 min

This is the one interface where a clean silo actively harms the design, and B3
is the consumer, so B3 is the one who gets hurt if it is vague. B3 confirms out
loud that all four are present and sufficient:

| Field | Why B3 needs it |
|---|---|
| `hours_ago` on **every** node | the time half of the match; without it a corridor is just a smear |
| `radius_km` per node, growing with `hours_ago` | normalising distance per node — raw km would make the 6-hour node win every match |
| `observed_at`, ISO-8601 ending in `Z` | anchors the whole lookback |
| `field_source` | so the UI can never imply real ocean data by accident |

### (c) Say the freeze out loud — 2 min

From the end of this meeting, `contracts.py` changes only by a dedicated PR with
**both** affected parties approving. Same for `main.py` and `config.py`
(additive keys are fine; changing an existing value needs a heads-up, because
ml/ imports it too).

---

## 2. Done when

- [ ] all three preflight outputs pasted in chat
- [ ] `main` branch protection on (B1)
- [ ] all three git emails confirmed registered on GitHub
- [ ] `.env` exists with a real key (B3)
- [ ] Sentinel-1 product downloading or on disk (B1)
- [ ] `contracts.py` read by all three, Contract 2 confirmed by B3
- [ ] freeze stated

Then day 1 starts, and the rule that matters most is
**push daily, even unfinished** — a branch that lived four days is the single
biggest cause of painful conflicts, and right now two of us are invisible.
