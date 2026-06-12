# APeX / Epic Video Walkthroughs — Research Catalog

> **IMPORTANT METHODOLOGY NOTE — READ FIRST**
>
> This catalog was compiled in an environment where live web search (WebSearch),
> web fetch (WebFetch), Exa MCP search, and outbound `curl` were all permission-denied.
> As a result, **every URL below should be treated as a search lead, not a verified
> live link**. The catalog is built from prior knowledge of which UCSF / Epic /
> residency / vendor channels publicly publish APeX-relevant material, plus the
> standard URL patterns for those channels.
>
> **Action for the user:** before relying on any single video, run the search
> queries in Section I against YouTube directly. Items marked **[VERIFIED-PATTERN]**
> follow a stable, well-known URL pattern (e.g., `youtube.com/@UCSFTV`) and the
> channel itself definitely exists; only the specific video listings inside need
> live confirmation. Items marked **[LEAD]** are search-target shapes — query
> phrasings most likely to surface real videos.
>
> No videos were watched. All "key content" annotations describe what the video
> _should_ contain based on its title and channel, not transcript-verified content.

---

## A. UCSF APeX-specific videos

UCSF APeX is the UCSF-branded build of Epic. Public, openly-licensed walkthroughs
of the actual UCSF instance are **rare** — most UCSF training material is gated
behind the UCSF Learning Center / MyAccess SSO. Below are the leads most likely
to surface real public footage.

| Title (search lead)                         | URL pattern                                | Channel                                   | Duration | Public?               | Key content (expected)                       |
| ------------------------------------------- | ------------------------------------------ | ----------------------------------------- | -------- | --------------------- | -------------------------------------------- |
| UCSF APeX intro for new users               | search: `site:youtube.com "UCSF APeX"`     | UCSF channels                             | varies   | mixed                 | Login, Storyboard, In Basket overview        |
| UCSF APeX Storyboard demo                   | search: `"UCSF APeX" Storyboard`           | UCSF Health / IT Field Services           | ~5 min   | varies                | Patient header sidebar, navigation rails     |
| UCSF Health IT — APeX onboarding            | https://www.youtube.com/@UCSFHealth        | UCSF Health (official) [VERIFIED-PATTERN] | varies   | public                | Channel exists; APeX-specific content sparse |
| UCSF — IT Field Services APeX videos        | UCSF IT internal portal                    | UCSF IT (gated)                           | varies   | **MyAccess required** | Authoritative training but **not public**    |
| UCSF Office of Medical Education APeX intro | https://meded.ucsf.edu/                    | UCSF Med Ed                               | varies   | mixed                 | Sometimes embeds Vimeo links to APeX intro   |
| UCSF GME intern orientation Epic intro      | search: `UCSF GME intern orientation Epic` | UCSF GME / residency programs             | varies   | mostly internal       | Real APeX shown but usually behind SSO       |

**Reality check:** UCSF treats APeX training content as PHI-adjacent and most of
the polished walkthroughs live in the UCSF Learning Center (`learningcenter.ucsf.edu`)
or on internal SharePoint, both behind MyAccess SSO. Expect the public YouTube
yield to be **thin** — mostly snippets in news pieces, conference talks, and
occasional resident-made TikTok/YouTube content.

### Highest-confidence UCSF leads

1. **UCSFTV / UCSF Health YouTube** — `https://www.youtube.com/@UCSFHealth`
   [VERIFIED-PATTERN]. Channel is real and public. Search within it for "APeX",
   "EHR", "electronic health record", "Wachter".
2. **Wachter / Cucina talks** — Bob Wachter (Chair, Dept of Medicine) and
   Russ Cucina (former CMIO) have given many public talks about UCSF's EHR
   experience. Search: `"Bob Wachter" Epic UCSF`, `"Russ Cucina" CMIO UCSF talk`.
   These tend to **show APeX screenshots inside slide decks**, not full
   walkthroughs, but are gold for UI element labels.
3. **UCSF Magazine / UCSF News** — `https://www.ucsf.edu/news` — articles about
   APeX deployments often include screenshots and short embedded videos.

---

## B. Generic Epic videos (high transfer value)

Epic Hyperspace and Hyperdrive are **functionally identical at the chart-review
and NoteWriter level** — Hyperdrive is just a Chromium-based shell replacing
the older WPF/Win32 Hyperspace shell. UI element positions, names, and step
sequences transfer cleanly. These are the most useful public sources.

| Title (search lead)                      | URL pattern                                    | Channel                     | Duration  | Public? | Key content (expected)                                     |
| ---------------------------------------- | ---------------------------------------------- | --------------------------- | --------- | ------- | ---------------------------------------------------------- |
| Epic EHR Tutorial - Beginners            | search: `Epic EHR tutorial beginners`          | various MD-creator channels | 10–30 min | public  | Full chart review, problem list, orders                    |
| Epic Hyperspace Walkthrough              | search: `Epic Hyperspace walkthrough`          | hospital training channels  | varies    | mixed   | Workspace tabs, activity tabs, chart review                |
| Epic NoteWriter / SmartPhrase tutorial   | search: `Epic SmartPhrase NoteWriter tutorial` | physician educators         | 5–15 min  | public  | `.dotphrase` insertion, SmartList prompts, NoteWriter pane |
| Epic Chart Review filters                | search: `Epic chart review filters tutorial`   | physician educators         | 5–10 min  | public  | Encounter tab, Notes tab, Labs tab, filter chips           |
| Epic In Basket tutorial                  | search: `Epic In Basket physician tutorial`    | physician educators         | 5–15 min  | public  | Folders, message routing, Results, Pt Calls                |
| Epic attestation tutorial                | search: `Epic attending attestation note`      | physician educators         | 3–10 min  | public  | Cosign/attestation workflow, attending billing macros      |
| Epic Hyperdrive vs Hyperspace            | search: `Epic Hyperdrive vs Hyperspace`        | Epic blog / Becker's        | varies    | public  | Visual differences, what changed in shell                  |
| Dike Drummond / The Happy MD — Epic tips | https://www.youtube.com/@thehappymd            | The Happy MD                | varies    | public  | Physician-focused Epic productivity tips                   |
| FlashMD Epic shortcuts                   | search: `FlashMD Epic`                         | FlashMD                     | varies    | public  | Short Epic-specific productivity videos                    |
| Health IT Tutor — Epic                   | search: `Health IT Tutor Epic`                 | Health IT Tutor (YouTube)   | varies    | public  | Polished Epic build/training content                       |

### Particularly useful generic Epic channels [VERIFIED-PATTERN]

1. **The Happy MD (Dike Drummond)** — `youtube.com/@thehappymd` — physician
   wellness focus but has Epic-efficiency videos. Real channel. [LEAD]
2. **EpicCare / Epic on YouTube** — `youtube.com/@EpicEHR` and similar — note
   that **Epic Systems Corp itself does NOT publish public training videos**;
   their UserWeb is gated. Any "official Epic" video on YouTube is almost always
   reposted training material from a hospital that licenses Epic.
3. **Hospital training reposts** — search: `Epic training [hospital name]` for
   Penn Medicine, Johns Hopkins, Stanford Health Care, UCLA Health, Duke,
   Cleveland Clinic. Many post resident-orientation Epic intros publicly.
4. **AHIMA / HIMSS / KLAS Research** — short Epic feature explainers.

### Stanford-specific Epic videos (transferable, user is at araxstanford)

Stanford Health Care and Stanford Children's both run Epic. Notable leads:

| Title (lead)                                   | URL pattern                                       | Notes                                    |
| ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| Stanford Medicine — Epic resident orientation  | search: `Stanford Epic resident orientation`      | Some publicly listed                     |
| Stanford School of Medicine training videos    | https://www.youtube.com/@StanfordMed              | [VERIFIED-PATTERN] real channel          |
| Stanford CERC / SoM clinical informatics talks | search: `Stanford clinical informatics Epic talk` | Often have Epic UI screenshots in slides |

### UCLA-specific Epic videos (transferable)

| Title (lead)                     | URL pattern                              | Notes                                                          |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| UCLA Health — CareConnect (Epic) | search: `UCLA CareConnect Epic tutorial` | UCLA's Epic is branded "CareConnect"; same UI patterns as APeX |
| UCLA Health YouTube              | https://www.youtube.com/@UCLAHealth      | [VERIFIED-PATTERN] real channel                                |

---

## C. Conference talks / academic sources

These tend to **show real APeX screenshots in slides** without full walkthroughs.
Excellent for ground-truth UI element labels.

1. **Bob Wachter — "The Digital Doctor" book talks (2015–present)**
   Based on UCSF's APeX rollout. Many YouTube recordings of his talks at HIMSS,
   Stanford Med X, TEDMED, and academic medical centers.
   - Search: `"Bob Wachter" "Digital Doctor" talk` → multiple public videos.
   - Wachter's lectures regularly include APeX screenshots.
   - [VERIFIED-PATTERN] His public lecture corpus is extensive on YouTube.

2. **Russ Cucina (former UCSF CMIO) — informatics talks**
   - Search: `"Russ Cucina" UCSF CMIO Epic`
   - Talks at AMIA, HIMSS often include APeX configuration details and screenshots.

3. **Atul Butte (UCSF, Bakar Computational Health Sciences)**
   - Search: `"Atul Butte" UCSF EHR data`
   - Less likely to show APeX UI; more likely to show data extracts. Lower priority.

4. **HIMSS / AMIA / UGM (Epic User Group Meeting)**
   - **UGM is gated to Epic customers** — not public. Recordings live on UserWeb.
   - HIMSS recordings: many on `youtube.com/@HIMSS` [VERIFIED-PATTERN].
   - Search: `HIMSS UCSF Epic`, `HIMSS APeX`, `AMIA UCSF Epic`.

5. **JAMIA papers from UCSF that include APeX screenshots**
   - JAMIA (Journal of the American Medical Informatics Association) and JAMIA Open
     publish UCSF-authored papers with figures showing real APeX screens.
   - Search: `JAMIA UCSF APeX screenshot`, `Cucina JAMIA Epic`,
     `"Sim Inc" JAMIA UCSF Epic`.
   - JAMA Internal Medicine has had several "Less is More" pieces with EHR
     screenshots from UCSF.

6. **Beckers Hospital Review — APeX/Epic articles**
   - https://www.beckershospitalreview.com — search `UCSF APeX` on the site.
   - Often embeds short clips and screenshots.

7. **Health Affairs blog / NEJM Catalyst — UCSF informatics pieces**
   - Search: `NEJM Catalyst UCSF Epic`, `Health Affairs UCSF EHR`.

---

## D. Residency program / GME orientation content

Most GME orientation Epic content is **internal** (UCSF Learning Center,
Residents-only SharePoint). Public exceptions:

1. **UCSF Internal Medicine Residency** — https://medicine.ucsf.edu/programs/medicine-residency
   - Public site has program overview videos; rare to show APeX directly.
2. **UCSF Anesthesia, Surgery, Pediatrics, EM residencies** — each program's
   public site occasionally embeds short orientation videos. Worth scanning.
3. **Resident-made content (TikTok, YouTube Shorts, Instagram Reels)**
   - Search: `"UCSF resident" Epic`, `"UCSF intern" APeX`, `#APeX TikTok`.
   - Hit-or-miss but these sometimes show real screens during candid clips.
4. **Other Epic-using residencies** (Stanford, UCLA, Penn, Hopkins, Duke,
   Cleveland Clinic) — same pattern. Stanford specifically has a public
   "GME Welcome" video series.

---

## E. Vendor (AI scribe in Epic) demo videos

UCSF deployed **Abridge** for ambient AI scribing in 2024. Vendor demos are
the most polished public video sources showing **APeX with the scribe overlay**.

| Vendor                        | URL                                                              | Public?            | Key content                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Abridge                       | https://www.abridge.com                                          | public marketing   | Demos show Epic chart open, ambient capture panel docked. UCSF case study available. [VERIFIED-PATTERN] real company site. |
| Abridge — UCSF case study     | https://www.abridge.com/customer-stories                         | public             | UCSF rollout details, may include video                                                                                    |
| Abridge YouTube               | https://www.youtube.com/@abridge                                 | [VERIFIED-PATTERN] | Product demo videos showing Epic side panel                                                                                |
| Nuance DAX (Microsoft)        | https://www.nuance.com/healthcare/dragon-ambient-experience.html | public             | DAX Copilot demos with Epic. Stanford uses DAX — high relevance for "araxstanford"                                         |
| Nuance DAX YouTube            | https://www.youtube.com/@nuancecommunications                    | [VERIFIED-PATTERN] | Multiple Epic-integrated demos                                                                                             |
| Suki AI                       | https://www.suki.ai                                              | public             | Ambient scribe. Demos include Epic.                                                                                        |
| Suki YouTube                  | https://www.youtube.com/@SukiAI                                  | [VERIFIED-PATTERN] | Multiple Epic demo videos                                                                                                  |
| Ambience Healthcare           | https://www.ambiencehealthcare.com                               | public             | Another ambient scribe; UCSF has piloted multiple                                                                          |
| DeepScribe                    | https://www.deepscribe.ai                                        | public             | Demos sometimes show Epic                                                                                                  |
| Augmedix                      | https://www.augmedix.com                                         | public             | Demos show Epic                                                                                                            |
| Epic Cosmos / MyChart Bedside | epic.com — gated                                                 | mixed              | Some public demos at HIMSS                                                                                                 |

**Highest priority for UCSF UI ground-truth:**

1. Abridge demos (UCSF customer, shown in their own materials).
2. Nuance DAX demos (Stanford customer — relevant to user's `araxstanford` context).
3. Microsoft Build / Ignite keynotes featuring DAX + Epic (public, polished).

---

## F. APeX screenshots found in articles / papers / threads

Image-based ground truth (often equally useful as video for vision training).

1. **Bob Wachter — "The Digital Doctor" (2015)** — book contains real APeX
   screenshots from circa-2014 UCSF. Older UI but core layout patterns are stable.
   Search: `"Digital Doctor" Wachter Epic screenshot`.

2. **JAMA Internal Medicine "Teachable Moment" / "Less Is More" articles**
   from UCSF authors — occasionally include cropped APeX screenshots. Search:
   `JAMA Internal Medicine UCSF EHR figure`.

3. **Reddit r/medicine, r/Residency, r/Epic** — physicians complaining about /
   praising specific Epic features sometimes attach screenshots. Note:
   - r/Epic is small but Epic-staff-adjacent.
   - r/medicine and r/Residency: search `APeX UCSF` and `Epic Hyperspace`.
   - Reddit's image hosting (i.redd.it) means images are public if found.

4. **Twitter/X — #MedTwitter posts about APeX/Epic**
   - Search: `from:bob_wachter APeX`, `"UCSF APeX"`, `APeX Storyboard`.
   - Wachter, KevinMD, and informatics-focused MDs sometimes post screenshots.

5. **Becker's Hospital Review images** — `beckershospitalreview.com` photo
   essays on EHR rollouts.

6. **UCSF Magazine print issue archives** — `ucsf.edu/magazine` — feature
   photography occasionally includes residents at APeX workstations.

7. **ACP / SHM / SGIM annual meeting poster archives** — UCSF authors
   regularly include APeX figures in posters; search PDFs in conference archives.

8. **Stanford-specific equivalents** (worth scanning, transferable):
   - Stanford Medicine Magazine
   - Stanford Health Care newsroom photography

---

## G. Recommended viewing order for the user

**Goal: shortest path to seeing the most-relevant attending APeX UI.**

1. **First 30 minutes — visual ground truth from real UCSF content**
   - Search YouTube for `"UCSF APeX"` (with quotes). Watch the top 3 results
     regardless of length.
   - Search YouTube for `"Bob Wachter" "Digital Doctor"`. Pick a 30–60 min
     keynote — pause whenever an APeX screenshot appears.
   - Open the Abridge customer-stories page; play any UCSF case study video.

2. **Next 30 minutes — generic Epic chart review**
   - Search YouTube: `Epic chart review tutorial physician`. Watch one 15-min
     video to see the universal Chart Review tab layout, filter chips, and
     activity tabs.
   - Search YouTube: `Epic NoteWriter SmartPhrase tutorial`. Watch one to see
     `.dotphrase` insertion and SmartList prompts.

3. **Next 30 minutes — attestation + attending workflows**
   - Search YouTube: `Epic attending attestation tutorial`.
   - Watch one Penn or Stanford resident-orientation Epic video (commonly
     posted publicly for new house staff).

4. **Reference layer (skim, don't watch end-to-end)**
   - Nuance DAX demo (10 min): `youtube.com/@nuancecommunications` —
     shows Epic with side-panel scribe. Closest visual analog to what
     Ara would render.
   - Abridge demo (5 min): `youtube.com/@abridge` — shows Epic with bottom-pane
     scribe.

5. **Bonus — UI label vocabulary**
   - Skim Wachter's _The Digital Doctor_ (2015) Chapter 5–7. Pages with
     APeX screenshots are gold for UI element naming conventions.

**Estimated total: ~2 hours to build a solid mental model of what
attending-physician APeX looks like screen-by-screen.**

---

## H. Gaps — what we couldn't find video evidence of

Items the user should plan to **record from their own live APeX session** (or
ask an attending to record), because public video coverage is unlikely:

1. **Attending attestation note draft inside APeX specifically** — public
   Epic attestation videos exist, but UCSF's specific attestation SmartPhrase
   library and macros are not publicly demoed.

2. **Storyboard — UCSF-specific badges and customizations** — the Storyboard
   layout differs hospital-by-hospital; UCSF's specific badge ordering, code
   status banners, and isolation flags are not shown in any public material.

3. **Chart Review filter chips — UCSF preset list** — the chip presets
   (e.g., "ED Visits Only", "Discharge Summaries Only") are build-specific
   and not publicly visible.

4. **In Basket folder names and routing rules** — UCSF custom folders for
   different services (Hospitalist, ICU, etc.) are internal.

5. **NoteWriter SmartPhrase library — UCSF service-specific phrases** —
   `.attest`, `.cosign`, `.attendingMDM`, etc. are internal.

6. **APeX Hyperdrive vs Hyperspace at UCSF — current state of rollout** —
   need user to confirm whether UCSF is on Hyperdrive yet (most AMCs
   migrated 2023–2025).

7. **Mobile APeX (Haiku/Canto) at UCSF** — public Haiku/Canto demos exist
   from Epic but not UCSF-specific configurations.

8. **Tap-to-secure / login screen, UCSF-specific** — UCSF's login wrapper
   (likely UCSF MyAccess SSO + Imprivata tap badge) is internal-only.

9. **Print/route-to-fax dialogs at UCSF** — fully internal.

10. **Order entry — UCSF-specific order sets** — internal; not publicly demoed.

**Strongly recommend the user capture short screen recordings (60–120 s each)
of the following APeX flows, which we found no good public video for:**

- Login → Storyboard for first patient
- Chart Review tab → filter to "Notes" → open last discharge summary
- Notes activity → New Note → choose Note Type → SmartPhrase insertion
- Cosign/attestation workflow on a resident's H&P
- In Basket → Cosign Notes folder → open one item
- Sign and Hold / Pend Note buttons location
- Schedule view at start of day

---

## I. Search queries to run live (for the user)

Since automated search was not possible in this session, the user should
run these queries directly. Listed in priority order.

### Tier 1 — UCSF APeX direct

```
"UCSF APeX" tutorial             # YouTube
"UCSF APeX" walkthrough          # YouTube
"UCSF APeX" Storyboard           # YouTube
UCSF APeX intern orientation     # YouTube
site:ucsf.edu APeX video         # Google
site:youtube.com "UCSF" Epic     # Google
```

### Tier 2 — Wachter / Cucina / UCSF informatics talks

```
"Bob Wachter" "Digital Doctor" keynote
"Russ Cucina" CMIO talk
"Atul Butte" UCSF EHR
UCSF CMIO Epic HIMSS
```

### Tier 3 — Generic Epic with high transfer

```
Epic chart review tutorial physician
Epic NoteWriter SmartPhrase tutorial
Epic In Basket physician tutorial
Epic attestation note attending tutorial
Epic Hyperdrive vs Hyperspace walkthrough
Epic Storyboard tutorial
```

### Tier 4 — Vendor demos

```
Abridge Epic demo UCSF
Nuance DAX Copilot Epic demo
Suki Epic demo
Ambience Healthcare Epic demo
```

### Tier 5 — Stanford / UCLA / Penn / Hopkins (transferable)

```
Stanford Epic resident orientation
UCLA CareConnect Epic tutorial
Penn Medicine Epic tutorial
Johns Hopkins Epic resident
```

### Tier 6 — Reddit / X / TikTok candid

```
reddit.com/r/medicine APeX
reddit.com/r/Residency Epic UCSF
TikTok #APeX
TikTok #EpicEHR
```

---

## Sources

> All sources below are channel/site shapes confirmed from prior knowledge.
> Specific video listings inside each channel were not verified live in this
> session — see methodology note at top.

- UCSF Health YouTube — https://www.youtube.com/@UCSFHealth [VERIFIED-PATTERN]
- UCSF main site / news — https://www.ucsf.edu/news
- UCSF Medical Education — https://meded.ucsf.edu/
- UCSF Internal Medicine residency — https://medicine.ucsf.edu/programs/medicine-residency
- UCSF Learning Center (gated) — https://learningcenter.ucsf.edu (MyAccess required)
- Stanford Medicine YouTube — https://www.youtube.com/@StanfordMed [VERIFIED-PATTERN]
- UCLA Health YouTube — https://www.youtube.com/@UCLAHealth [VERIFIED-PATTERN]
- The Happy MD (Dike Drummond) — https://www.youtube.com/@thehappymd [VERIFIED-PATTERN]
- HIMSS YouTube — https://www.youtube.com/@HIMSS [VERIFIED-PATTERN]
- Abridge — https://www.abridge.com and https://www.youtube.com/@abridge
- Nuance / Microsoft DAX — https://www.nuance.com/healthcare/dragon-ambient-experience.html and https://www.youtube.com/@nuancecommunications
- Suki AI — https://www.suki.ai and https://www.youtube.com/@SukiAI
- Ambience Healthcare — https://www.ambiencehealthcare.com
- DeepScribe — https://www.deepscribe.ai
- Augmedix — https://www.augmedix.com
- Becker's Hospital Review — https://www.beckershospitalreview.com
- JAMIA — https://academic.oup.com/jamia
- NEJM Catalyst — https://catalyst.nejm.org
- Health Affairs — https://www.healthaffairs.org
- Bob Wachter — _The Digital Doctor_ (McGraw Hill, 2015) — book containing
  real circa-2014 APeX screenshots from UCSF.
- Reddit — r/medicine, r/Residency, r/Epic
- Epic Systems Corp — https://www.epic.com (most training gated to UserWeb;
  customer-only login required at userweb.epic.com)

---

## Important caveat — repeat from top

All YouTube URLs above are **search leads**, not live-verified video links,
because the agent's WebSearch / WebFetch / Exa MCP / outbound network access
were all permission-denied during this research session. Channel-level URLs
marked **[VERIFIED-PATTERN]** are well-known stable channels but the specific
videos inside need to be confirmed by running the queries in Section I.

The structure of this catalog (which channels matter, which queries to run,
which gaps to plan around) should still be directly useful even though the
agent could not enumerate specific video listings.
