---
name: real-estate-image-downloader
description: Extract and download property photos from public real estate listing links. Use when the user asks to get images from listing URLs, save listing photos, download real estate images, collect property photos from broker pages, or turn property links into ready-to-download image files. Handles single listings and batches of listing URLs, returns direct image URLs when needed, saves images with clean filenames, can filter for interior photos, exterior photos, or both, can export a CSV of image links, can create a zip bundle for download, and includes source-specific guidance for Inmuebles24, EasyBroker, Propiedades, Vivanuncios, Pincali, Realtor.com International, Engel & Völkers, and other public listing pages.
license: MIT
metadata:
  author: perplexity-computer
  version: '1.0'
---

# Real Estate Image Downloader

## When to Use This Skill

Use this skill when the user asks you to:

- get images from a real estate property link
- download listing photos
- collect property images from broker or portal pages
- save property photos so they are ready to download
- extract direct image URLs from public real estate listings
- process multiple property URLs and save the images in a clean set

Use this only for public web pages. If a listing requires login, explain that access is limited and ask the user for a public URL or a downloaded export.

If the user specifies interior photos, exterior photos, or both, honor that preference during extraction and naming.

## Core Rules

- Prefer the original listing page over third-party reposts.
- Prefer direct image files (`.jpg`, `.jpeg`, `.png`, `.webp`) when the user wants something easy to reuse.
- Save images to the workspace with clear, property-specific filenames.
- If the page exposes many variants of the same photo, prefer the largest usable version.
- If the user asks for many listings, keep results organized by property or source.
- If the user asks for interior-only, exclude obvious exterior shots, aerials, façades, and street views.
- If the user asks for exterior-only, exclude obvious room, kitchen, bathroom, and amenity interior shots.
- If the user asks for both, keep the two groups clearly separated.
- Never claim an image is licensed for reuse unless the page explicitly states that.

## Workflow

1. Identify the input.
- If the user gave one or more public property URLs, use those.
- If the user provided a document or text list, extract the URLs first.
- If the user only named a property and did not provide a URL, search for the public listing page.

2. Open the listing page.
- Use page-reading or browsing tools to inspect the listing.
- Look for gallery images, structured data, JSON blobs, Open Graph tags, lazy-loaded image attributes, or CDN image URLs.

3. Extract image sources.
- Capture the best direct image URLs available.
- Deduplicate near-identical URLs when they only differ by thumbnails or tracking parameters.
- If the user only wants links, return the cleaned direct URLs plus the source page.

4. Classify the images.
- Label each selected image as interior, exterior, mixed, or unclear when possible.
- Use page context such as gallery captions, surrounding text, filenames, and visible content hints.
- When the user asked for interior or exterior specifically, filter accordingly before saving.

5. Save the images.
- Download each selected image into the workspace.
- Use filenames that include the property name, building name, or listing ID when available.
- Add an interior or exterior tag when relevant, like `peninsula-santa-fe-interior-01` or `paradox-exterior-02`.
- Keep numbering consistent within each group.

6. Deliver the result.
- If the user asked for files, share the saved images.
- If the user asked for a bundle, also provide a zip or organized folder when practical.
- If the user asked for links, provide direct image URLs and page URLs.
- If the user asked for both interior and exterior, present them as separate groups.

## Deliverables

When the user asks for download-ready output, prefer this package:

- saved image files
- a CSV file with one row per image
- a zip bundle containing the images and CSV when there are multiple files

The CSV should include these columns when possible:

- property_name
- building_name
- listing_id
- image_type
- image_label
- image_url
- source_page
- source_domain
- filename

## Tool Strategy

### Single listing

For one listing URL:
- Read or browse the listing page.
- Extract the direct image URLs.
- Save the best images individually.

### Multiple listings

For many listing URLs:
- If there are 10 or more listing pages, prefer a batch workflow.
- Create a workspace file with one URL per line.
- Use a batch browsing approach when the pages require rendering.
- For 20 or more URLs, request confirmation before running a large batch job.

### Search fallback

If no URL is provided:
- Search for the property listing page by property name, building, broker, and city.
- Prefer official broker pages or the strongest listing source.

## Extraction Checklist

When reading a listing page, check these common image locations:

- `img src`
- `srcset`
- `data-src`
- `data-lazy`
- `data-original`
- JSON inside `<script>` tags
- Open Graph image tags
- gallery carousels and lightboxes
- API calls made by the page that return image lists

## Naming Rules

Use filenames like:

- `property-name-01`
- `property-name-02`
- `building-name-listing-123-01`
- `broker-property-name-front`

If the property name is unclear, use:

- source domain
- building name
- listing ID

Avoid spaces and special characters.

## Interior and Exterior Filtering

When the user asks for interior photos:
- prioritize living room, dining room, kitchen, bedroom, bathroom, closet, office, terrace, balcony, and indoor amenity spaces
- deprioritize skyline shots, tower façades, street views, site plans, and neighborhood-only images

When the user asks for exterior photos:
- prioritize tower façades, entrance, drop-off, motor lobby, terrace views from outside, skyline context, and amenity exteriors
- deprioritize room-by-room interiors unless the page offers no other usable photos

When the user asks for both:
- collect both sets
- name and organize them separately
- make the separation explicit in the response

## Output Formats

### If the user wants downloadable files

Provide:
- saved image files
- a CSV manifest when there are multiple images
- a zip bundle if there are many images or if the user asked for one downloadable package

### If the user wants reusable links

Provide:
- direct image URL
- source listing page URL
- short label for each image when possible

### If the user wants both

Provide:
- the shared image files
- the direct image URLs
- the original listing page URL
- the CSV manifest when there are multiple images

## CSV Rules

When producing a CSV:
- include one image per row
- include direct image URL and source page URL
- include the saved filename if the image was downloaded
- include `interior`, `exterior`, `mixed`, or `unclear` in `image_type`
- preserve the property grouping through property name, building name, or listing ID

## Zip Bundle Rules

When producing a zip bundle:
- include all downloaded images
- include the CSV manifest if one was created
- organize by property when the set spans multiple listings
- use a clear top-level folder name based on the building, property, or request

## Source-Specific Notes

### Inmuebles24

For Inmuebles24 pages:
- inspect the main gallery, lazy-loaded image attributes, and image CDN URLs
- prefer the largest non-thumbnail image version
- capture the listing ID from the page or URL when available
- use the building name and listing ID in filenames when possible

### EasyBroker

For EasyBroker pages:
- inspect carousel images, Open Graph tags, and any structured data exposed in the page
- check for CDN image patterns and prefer the highest useful resolution
- capture the broker name, property title, and listing code when available
- use broker or property identifiers in filenames if the property name is ambiguous

### Propiedades.com

For Propiedades.com pages:
- inspect the listing gallery, thumbnail-to-fullsize URL patterns, and structured data blocks
- capture property type, operation, and listing code when visible
- prefer direct CDN image URLs over resized thumbnail variants

### Vivanuncios

For Vivanuncios pages:
- inspect gallery carousels, lazy-loaded image attributes, and JSON embedded in the page
- capture headline, neighborhood, and listing identifier when available
- prefer the highest-resolution image variant and avoid tracking-heavy thumbnail links

### Pincali

For Pincali pages:
- inspect the page for image CDN patterns and alternate image sizes
- capture the property title, neighborhood, and any listing code present in the URL or page
- prefer the cleanest direct image version before saving

### Realtor.com International

For Realtor.com International pages:
- inspect listing galleries, Open Graph tags, and any image metadata exposed in the page source
- capture the address, operation, and property type when visible
- prefer direct media URLs that resolve to the largest stable image version

### Engel & Völkers

For Engel & Völkers pages:
- inspect the property gallery, structured page data, and Open Graph image references
- capture the development or neighborhood name when available
- use polished filenames because these pages often represent premium listings with repeated image variants

### Other public listing sources

Apply the same extraction logic to other public portals and broker pages, including:
- Lamudi
- Metros Cúbicos
- Icasas
- Selva & Co Realty
- Rentberry

When a new portal appears:
- inspect the gallery structure first
- look for structured data or direct CDN image URLs
- save the source domain in the CSV manifest
- add stable naming based on property name, building, and listing ID

## Quality Bar

Before finishing:

- confirm the saved files open correctly
- avoid tiny thumbnails when larger images are available
- remove duplicates
- make sure filenames are understandable
- make sure every reported image came from the supplied property page or a clearly identified source page
- if a CSV was requested or useful, confirm it matches the downloaded files
- if a zip was created, confirm it contains the expected files

## Examples

### Example 1
User: "Get the photos from this Inmuebles24 listing and make them downloadable."

Do:
- open the listing page
- extract the gallery image URLs
- save the images with listing-specific filenames
- share the saved files back to the user

### Example 2
User: "Pull all image links from these 12 property URLs."

Do:
- create a URL list file
- run a batch page-reading workflow
- collect cleaned direct image URLs per listing
- save a structured result and download the best images if requested

### Example 3
User: "Find Peninsula Santa Fe rental listings and download the best exterior photos."

Do:
- search for public listing pages
- choose the most relevant current listings
- extract exterior-focused images
- save and share the final set

### Example 4
User: "Get the interior photos too."

Do:
- revisit the same listing pages if needed
- collect interior-focused images such as living areas, kitchens, bedrooms, bathrooms, and terraces
- save them with filenames that clearly mark them as interior
- share them separately from exterior shots when both are requested

### Example 5
User: "Download all images from these EasyBroker and Inmuebles24 links and make them ready to download."

Do:
- collect the direct image URLs from each page
- save the images with clean filenames
- generate a CSV manifest of all saved images
- create a zip bundle containing the images and CSV
- share the bundle with the user

## Response Pattern

Keep the user-facing answer short and practical:

- what you found
- what you saved
- what is attached
- any limits, such as missing public images or login walls
