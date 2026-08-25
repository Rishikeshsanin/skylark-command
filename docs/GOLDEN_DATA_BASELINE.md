# Skylark Command — Golden Live Baseline

This document is a release/evaluator verification reference for the known live monday.com dataset. It is not application source data and must never replace live queries.

## Deals

- Total Deals: **346**
- Open Deals: **49**
- Won Deals: **165**
- Dead Deals: **127**
- On Hold: **2**
- Missing / malformed status: **3**
- Known open pipeline: **₹688,152,293.17**
- Open deals with known numeric value: **47 / 49**
- Open deals with unknown value: **2 / 49**
- Known won value: **₹95,038,938.98**
- Won deals with known numeric value: **64 / 165**
- Won deals with unknown value: **101 / 165**

Important: known won value is not a complete historical won-revenue total because many won records have missing values.

### Known open pipeline by sector

| Sector | Open deals | Known open pipeline | Unknown values |
| --- | ---: | ---: | ---: |
| Tender | 4 | ₹531,964,562.45 | 0 |
| Railways | 13 | ₹52,023,788.20 | 0 |
| DSP | 6 | ₹32,175,420.00 | 0 |
| Mining | 9 | ₹29,083,888.20 | 0 |
| Renewables | 8 | ₹25,569,056.33 | 1 |
| Security and Surveillance | 1 | ₹7,340,400.00 | 0 |
| Powerline | 4 | ₹6,324,978.00 | 0 |
| Missing sector | 3 | ₹3,547,860.00 | 1 |
| Construction | 1 | ₹122,340.00 | 0 |

## Work Orders

- Total Work Orders: **176**
- Completed: **117**
- Ongoing: **25**
- Executed until current month: **12**
- Not Started: **11**
- Pause / struck: **4**
- Partial Completed: **2**
- Details pending from Client: **1**
- Missing status: **4**
- Active Work Orders: **55**
- Work Order amount incl. GST: **₹249,746,302.87**
- Billed incl. GST: **₹126,719,936.37**
- Collected incl. GST: **₹90,428,187.50**
- Receivables: **₹36,291,748.87**
- To be billed incl. GST: **₹123,026,366.49**
- Records with unknown collected amount: **98**

## Cross-board client intelligence

- Normalized Deal client keys: **199**
- Normalized Work Order client keys: **51**
- Work Order client keys matched across boards: **50 / 51**
- Known unmatched Work Order client: **COMPANY042**
- Client keys with both an open Deal and an active Work Order: **9**

## Freshness warning

The source dataset is stale relative to August 2026. Known dates extend only into early 2026, with tentative close data reaching approximately April 2026.

Therefore:
- a current-quarter query in Q3 2026 may have no usable current-quarter data;
- the application must not present that absence as zero performance;
- the deterministic period layer should expose no-data state and latest-available context where supported;
- Gemini must not invent dates, activity, or current-quarter performance.

## Release use

Before submission, compare the live deployed application against this reference. If live monday.com data has intentionally changed, investigate and document the difference rather than editing expected values simply to make tests pass.
