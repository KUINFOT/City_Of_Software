# Analytics

Three tools that help a vendor price a bid with evidence and notice a posting that looks unusual. They are statistics over what the platform has collected, not advice, and the way they are built is meant to stop them overstating what the data can support.

## In plain words

| Tool | Question it answers | Where | Endpoint |
| --- | --- | --- | --- |
| **Historical budgets** | "What did comparable projects cost?" | Analytics → Budget comparison | `GET /analytics/budgets` |
| **Agency frequency** | "How often does each agency buy software, and how big?" | Analytics → Frequency by agency | `GET /analytics/agency-frequency` |
| **Outlier flag** | "Is this TOR's budget far outside the usual range?" | On the TOR detail page | `outlier` in `GET /tors/:id` |

All three are available to any signed-in user (outlier flags are visible to anyone, since they are part of the public TOR detail).

## Four rules that shape every number

1. **Only reviewed records count** (for the two reports). `published` records, plus `closed` (a published record kept after its deadline). Unreviewed records have unconfirmed budgets, and `superseded` ones duplicate a record already counted. See [which records count](#which-records-count).
2. **A missing value is excluded and counted, never defaulted.** A TOR with no extractable budget is not a zero-baht project. It is left out and reported as `excludedNoBudget`. A TOR with no announcement date cannot be placed in a year, so it is left out of frequency figures and reported as `excludedNoDate`.
3. **Too little data means no number.** Below `OUTLIER_MIN_COMPARABLE_N` (default **5**) comparable records, the report returns `sufficient: false` and **no figures at all**, not a figure with a caveat attached. A median of two projects is not a median worth showing.
4. **Every response says what it rests on.** The record count travels with the figures, the selection is described back to you, and every report is labelled `basis: "nominal_unadjusted"`: amounts are as announced, with no inflation adjustment and no VAT normalisation.

> [!NOTE]
> The minimum size (5) and the outlier margin (1.5) are sensible defaults that **have not been validated** against a labelled data set; none exists yet. They are settings (`OUTLIER_MIN_COMPARABLE_N`, `OUTLIER_IQR_MULTIPLIER`) precisely so they can be tuned once real volume exists.

---

## Historical budgets

Choose a **comparable set** with any of: agency, project type, a year range (matched against the announcement date, Gregorian years in the API, shown in Buddhist Era in the UI). The report returns:

- `recordCount` of records with a usable budget, and `excludedNoBudget` for those without.
- **Summary:** minimum, first quartile, median, third quartile, maximum, mean.
- **Distribution** across fixed bands: under ฿100k, 100k–500k, 500k–1M, 1M–5M, 5M–10M, 10M–50M, and 50M+. The bands are fixed rather than derived from the data so that two selections can be compared side by side. "Five projects in the middle band" means the same thing for every agency.
- **By year:** the record count and median for each year, each year with its own sufficiency check.
- `undatedRecordCount`: records counted above but absent from the by-year breakdown because their date was never extracted.

A budget that is zero or negative is treated as a parsing artefact, not a price, and is excluded. A figure exactly on a band edge belongs to the band above.

### Reading it well

- The **median** is the most useful single number; budgets are skewed and a few very large contracts drag the mean up.
- Compare the **IQR** (Q1 to Q3) with your intended bid: that is where the middle half of comparable projects landed.
- If `byYear` shows `sufficient: false` for a year, there are fewer than 5 records for that year alone; the overall figure may still be fine.

---

## Agency frequency

For every agency with at least one dated record in the selection (project type and year range are optional filters; there is no agency filter, because the report *is* the comparison across agencies):

| Field | Meaning |
| --- | --- |
| `procurementCount` | Dated procurements: what the rate is built from |
| `procurementsPerYear` | `procurementCount ÷ years in the window`, or `null` if below the minimum size |
| `typicalBudgetThb`, `q1Thb`, `q3Thb` | Median and quartiles of those that also have a usable budget, or `null` if below the minimum |
| `activeYears` | Distinct years the agency appears in |
| `excludedNoDate`, `excludedNoBudget` | Records left out of the rate and the size respectively |
| `frequencySufficient`, `sizeSufficient` | Whether each derived figure met the minimum |

Two design choices make agencies comparable:

- **Everyone is divided by the same window.** The window is your requested year range, or the span of years present in the data. A per-agency span (first to last year seen) would make an agency with one old record look as busy as one with one recent record.
- **Raw counts are always shown**, even when the derived rate is withheld. A count is a fact; a rate computed from two records is not.

Agencies are sorted by number of procurements, then by name.

---

## The outlier flag

> A statistical signal for further inquiry, not a finding of wrongdoing. This sentence travels with every flag the API returns (requirement FR-ANL-07).

### Method

Tukey's fences on the interquartile range, applied **within a comparable group**:

1. **Group** records by *agency × project type × announcement year (UTC)*.
2. If the group has fewer than `OUTLIER_MIN_COMPARABLE_N` (5) records, nobody in it is flagged and each gets `isOutlier: null`, reason `insufficient_comparables`.
3. Otherwise compute Q1, Q3 and IQR = Q3 − Q1. A budget is an **outlier** if it is below `Q1 − k·IQR` or above `Q3 + k·IQR`, with `k = 1.5` (`OUTLIER_IQR_MULTIPLIER`).
4. Store `deviationPct`, the signed percentage distance from the group's median.

**Why IQR and not a standard-deviation z-score?** Procurement budgets are heavily right-skewed and span orders of magnitude within one agency. A handful of very large contracts inflates the mean and the standard deviation until a z-score stops meaning anything. The IQR is computed from the middle half of the data, so it stays stable in the presence of the very outliers it is trying to find.

### What gets `null`

`isOutlier` is tri-state, like `isAwarded`: `true`, `false`, or `null` meaning "could not be evaluated", which is a different fact from "confirmed normal". The `reason` field says why:

| `reason` | Means |
| --- | --- |
| `outlier` | Flagged |
| `within_range` | Evaluated and ordinary |
| `insufficient_comparables` | Group smaller than the minimum |
| `no_budget` | The TOR has no extractable budget |
| `no_project_type` | The project type could not be inferred from the title |
| `no_year` | No announcement date |

A TOR with no project type is never put in an "other" bucket; that would make the comparison meaningless. The project type is inferred from title keywords (website, web application, mobile application, software, system, and so on), so a title that matches none of them stays unclassified.

### When it runs

`runOutlierAnalysis` recomputes **everything from scratch** (the comparable set for a record changes every time a new one is ingested, so incremental updates would drift). It runs daily at 07:00 when the scheduler is on, or on demand:

```bash
npm run extract -- --analyze-outliers
```

It also refreshes `procurement_stats`, a materialised summary of each evaluated group (count, mean, median, min, max, flagged ids).

### Which records count

| Used by | Includes | Why |
| --- | --- | --- |
| **Budget and frequency reports** | `published`, `closed` | A figure shown to a vendor should rest on reviewed, retained records |
| **Outlier job** | Everything except `rejected` | It must evaluate records *before* they are published so the flag is ready when they are |

So an outlier flag on a published TOR may have been computed against a group that included some unreviewed records. The flag is a heuristic, and the disclaimer says so.

---

## Limits worth knowing

- **Small samples.** With today's volume most groups are below the minimum of 5, so many TORs honestly show "not enough data". That is the design working, not a bug.
- **Nominal baht.** A 2019 contract and a 2026 contract are compared as announced.
- **Budgets are as extracted.** An AI-read budget can be wrong; a human-corrected one is trusted. Reports include only reviewed records, which is why review quality matters.
- **VAT is not normalised.** Some budgets are VAT-inclusive and some exclusive; the budget carries a `vatBasis` field (`inclusive`, `exclusive`, `unstated`), but the reports do not adjust for it.
- **Project type is a guess from the title** for scraped records. Title keywords are a deliberately cheap pre-filter, not classification.

## Related

- [API reference](api-reference.md#analytics): parameters and example responses
- [Extraction pipeline](extraction-pipeline.md): where budgets and dates come from
- [Vendor guide](guides/vendor-guide.md#price-a-bid-with-evidence)
