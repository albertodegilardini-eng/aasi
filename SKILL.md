---
name: santa-fe-real-estate-research
description: Research Santa Fe, Mexico City real estate asking prices and listing-agent backgrounds. Use when the user asks to compare renting prices, selling prices, current listings, tower-specific real estate data, or broker backgrounds for Santa Fe developments such as Paradox Torre 300, Peninsula Tower, Peninsula Santa Fe, or similar residential towers. Automatically identify the top 5 active Mexico City real estate websites, gather current public listing data, and produce both a markdown report and a CSV with source links.
metadata:
  author: Perplexity Computer
  version: '1.0'
---

# Santa Fe Real Estate Research

## When to Use This Skill

Use this skill when the user wants:

- Current rent prices for Santa Fe, Mexico City
- Current sale prices for Santa Fe, Mexico City
- A comparison across major Mexico City real estate portals
- Research focused on a specific tower, especially Paradox Torre 300 or Peninsula Tower
- Public-background research on real estate agents or brokers appearing on relevant listings
- A structured real estate market snapshot with source links

Do not use this skill for:

- Legal advice about purchases, leases, contracts, zoning, or title issues
- Appraisals presented as official valuations
- Private or paywalled MLS systems that require login
- Outreach to agents unless the user separately asks for that

## Default Output

Produce both of these unless the user asks for something else:

1. A markdown report summarizing:
- Websites selected
- Search scope and assumptions
- Current asking rent range
- Current asking sale range
- Tower-specific findings for Paradox Torre 300 and Peninsula Tower
- Named agents or brokerages found
- Public background findings for those agents
- Data gaps, conflicts, and caveats

2. A CSV with one row per relevant listing or agent result.

## Core Rules

- Work only from public information.
- Treat prices as asking prices, not closed transaction prices.
- Keep renting and selling data separate.
- Prioritize current and active listings over stale index pages.
- Use the user’s language for the final report and CSV headers when practical.
- Cite every factual statement with the actual source URL.
- If sources conflict, state the conflict instead of guessing.
- Never invent agent biographies or credentials.
- If an agent background cannot be verified from public sources, say so clearly.

## Search Workflow

### Step 1: Identify the 5 websites

Use web search to identify the top 5 active Mexico City real estate portals relevant to Santa Fe listings.

Selection criteria:

- Strong presence in Mexico City residential listings
- Current searchable listings for Santa Fe
- Publicly accessible pages
- Useful listing detail pages with price, unit details, and agent or brokerage info when available

Prefer large active portals over blogs or aggregator pages with weak detail.

If multiple candidates are similar, prefer the ones with:

- More active Santa Fe inventory
- Better listing detail pages
- Clearer agent or brokerage attribution

Record the final five sites in the report and explain why they were chosen.

### Step 2: Normalize tower and area names

Search using common variants, including:

- Santa Fe CDMX
- Santa Fe Ciudad de México
- Paradox Torre 300
- Paradox Santa Fe
- Peninsula Tower Santa Fe
- Peninsula Santa Fe

If the exact building name varies across sources, document the variant and explain why it is considered the same target or not.

### Step 3: Collect pricing data

For each of the 5 selected websites, gather public listing data for:

- Rentals in Santa Fe relevant to Paradox Torre 300 and Peninsula Tower when available
- Sales in Santa Fe relevant to Paradox Torre 300 and Peninsula Tower when available
- If tower-specific inventory is too thin, include closely related Santa Fe listings but keep them labeled as broader Santa Fe comps

For each listing, capture when available:

- Portal name
- Listing title
- Building or tower name
- Listing type: rent or sale
- Asking price
- Currency
- Maintenance fee if shown
- Size in square meters
- Bedrooms
- Bathrooms
- Parking spaces
- Furnished or unfurnished if shown
- Listing date or freshness signal if shown
- Agent name
- Brokerage name
- Listing URL

### Step 4: Clean and compare data

Normalize fields where possible:

- Currency to MXN if the site shows MXN; if another currency is shown, keep the original currency and note it
- Price formats without losing the original listing value
- Tower names and agent names for deduplication

Deduplicate obvious repeated listings across portals when the same unit appears multiple times.

When duplicates are found:

- Keep one primary row for summary calculations
- Preserve the alternate URLs in notes if useful

Compute and report, separately for rent and sale:

- Count of usable listings
- Minimum asking price
- Maximum asking price
- Median asking price when enough data exists
- Approximate asking price per square meter when size is available

Also produce a building-focused comparison for:

- Paradox Torre 300
- Peninsula Tower

If there are too few listings for a building, say that explicitly.

### Step 5: Research agent backgrounds

From the relevant listings, gather the names of agents and brokerages associated with Paradox Torre 300 and Peninsula Tower listings.

Then run public-background research on those agents using web search and page fetches.

Look for:

- Brokerage affiliation
- Public bio or profile page
- Years of experience if explicitly stated
- Professional specialization or market focus
- Public contact channels shown on brokerage or portal pages
- Other public evidence connecting them to Santa Fe or the target buildings

Good sources include:

- Brokerage profile pages
- Public listing profile pages
- Company team pages
- Public professional directories
- Interviews or articles with clear identification

Use caution with social profiles or third-party data pages. Only report what is explicitly visible and attributable.

Do not state any of the following unless the source explicitly says it:

- Education
n- Certifications
- Transaction history
- Reputation claims
- Rankings or awards

If only a name appears on a listing and no reliable public background is found, write: "Public background not verified from accessible sources."

### Step 6: Produce deliverables

Create:

- A markdown report with concise narrative findings and inline citations
- A CSV with structured listing and agent data

Recommended CSV columns:

- record_type
- focus_building
- portal
- listing_title
- listing_type
- asking_price
- currency
- maintenance_fee
- size_sqm
- bedrooms
- bathrooms
- parking_spaces
- furnished_status
- freshness_signal
- agent_name
- brokerage_name
- agent_background_summary
- source_url
- notes

Use `record_type` values such as:

- listing
- agent-background
- broader-comp

## Quality Checks

Before finishing, verify:

- Exactly 5 real estate websites were selected unless the user explicitly asked otherwise
- Rent and sale data are not mixed together in the summary
- Tower-specific findings are clearly separated from broader Santa Fe comps
- Every factual sentence in the report includes a source link
- The CSV has working source URLs
- No unsupported claims about agents were included
- Any missing or thin data is called out clearly

## Fallbacks

If one of the top sites blocks access or has unusable pages:

- Replace it with the next-best active Mexico City real estate portal
- Explain the replacement briefly in the report

If current listings for a target tower are scarce:

- Expand to broader Santa Fe listings for comparison
- Keep tower-specific and broader-area rows clearly labeled

If agent names are missing from listing pages:

- Use brokerage names when available
- Note that agent-level background research was limited by source visibility

## Example Requests

- Research current rental and sale asking prices in Santa Fe CDMX and focus on Paradox Torre 300 and Peninsula Tower.
- Compare the top 5 Mexico City real estate portals for Santa Fe listings and tell me which agents appear most often.
- Build a current market snapshot for Paradox Santa Fe and Peninsula Santa Fe, including agent backgrounds and source links.

## Final Response Pattern

The final response should briefly state:

- The five selected websites
- Whether enough current data was found for each target building
- The main asking price ranges for rent and sale
- Which agents or brokerages were identified and how strong the public background evidence was
- What files were produced
