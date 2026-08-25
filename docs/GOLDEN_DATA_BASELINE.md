# Skylark Command — Golden Data Baseline

Generated independently from the live monday.com boards for integration QA.

> **Important:** These are **raw monday-board baselines before Agent 1 normalization rules**. Source-specific sentinel/malformed-value handling may intentionally change some normalized financial/data-quality results. Use this document to catch unexplained drift, not to override canonical Agent 1 semantics.

## Board counts

- Deals: **346 items**
- Work Orders: **176 items**

## Raw Deals status distribution

| Status | Count |
| --- | ---: |
| Won | 165 |
| Dead | 127 |
| Open | 49 |
| On Hold | 2 |
| Missing/malformed | 3 |

## Raw open pipeline

- Open deals: **49**
- Open deals with numeric value: **47**
- Open deals without numeric value: **2**
- Sum of known raw open deal values: **688,152,293.17**

Raw open pipeline by sector:

| Sector | Open deals | Known raw value | Unknown-value deals |
| --- | ---: | ---: | ---: |
| Tender | 4 | 531,964,562.45 | 0 |
| Railways | 13 | 52,023,788.20 | 0 |
| DSP | 6 | 32,175,420.00 | 0 |
| Mining | 9 | 29,083,888.20 | 0 |
| Renewables | 8 | 25,569,056.33 | 1 |
| Security and Surveillance | 1 | 7,340,400.00 | 0 |
| Powerline | 4 | 6,324,978.00 | 0 |
| Missing sector | 3 | 3,547,860.00 | 1 |
| Construction | 1 | 122,340.00 | 0 |

## Raw Won deals

- Won deals: **165**
- Won deals with numeric value: **64**
- Won deals without numeric value: **101**
- Sum of known raw Won values: **95,038,938.98**

The very high unknown-value count is a useful data-quality test: the product should never imply that the sum above is necessarily total historical won revenue without a caveat.

## Raw Work Order execution distribution

| Execution status | Count |
| --- | ---: |
| Completed | 117 |
| Ongoing | 25 |
| Executed until current month | 12 |
| Not Started | 11 |
| Pause / struck | 4 |
| Partial Completed | 2 |
| Details pending from Client | 1 |
| Missing | 4 |

## Raw Work Order financial fields

- Known raw Amount Incl GST sum: **249,746,302.87**
- Known raw Billed Value Incl GST sum: **126,719,936.37**
- Known raw Collected Amount Incl GST sum: **90,428,187.50**
- Rows with missing/non-numeric collected amount: **98**
- Known raw Amount Receivable sum: **36,291,748.87**

Again, canonical normalized analytics may exclude source sentinel values or malformed rows.

## Cross-board identity baseline

Using only the explicit deterministic masked-code normalization:

- Unique normalized Deal client keys: **199**
- Unique normalized Work Order client keys: **51**
- Work Order clients matching a Deal client: **50**
- Unmatched Work Order client: **COMPANY042**

This is an important acceptance test. Cross-board logic should not fuzzy-match the final unmatched client merely to increase coverage.

## How to use this during integration

1. Run Agent 1 analytics against live monday data.
2. Compare item counts and categorical distributions first.
3. For financial values, document any differences caused by explicit normalization/sentinel rules.
4. Treat unexplained differences as potential mapping/calculation bugs.
5. Verify Agent 3 responses use Agent 1 deterministic values rather than recalculating them.
6. Verify Agent 2 only displays canonical analytics outputs and does not independently recompute totals.
