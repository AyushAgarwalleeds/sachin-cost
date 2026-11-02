# CutCost — Sachin Industries

A laser-cutting calculator and practical 2D CAD workspace, built as an installable React/Vite website for Vercel or Netlify. Drawings are processed locally in a browser worker. Optional Supabase sign-in shares costing and quotation history across factory devices without maintaining an application server.

## Test on this PC

Requires Node.js 22.12+; tested with Node 24.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. If this project is already running there, open that address. For a production/offline preview:

```sh
npm run build
npm run preview -- --port 4173
```

Open http://127.0.0.1:4173/. Do not open index.html directly. `npm test` runs regression checks; `npm run fixtures` creates a sample DXF and watermarked quotation PDF.

## Costing workflow

1. Import DXF or DWG files, up to 30 MB each. Confirm units against a known dimension.
2. Inspect the whole drawing and extracted jobs. Formatting/reference geometry is automatically excluded from costing. The preview initially shows cutting jobs only; **Show ignored** reveals the grey extras. Use **Delete ignored items** for one-click cleanup, **Undo cleanup** to restore it, and **Inspect ignored items → Restore as cutting** for intentional engraving/open cuts. Real gaps stay available for repair. Endpoint-on-edge contacts are recognised automatically, including the supplied perfect.dxf; dangling overruns are excluded without moving the source points. **Re-detect jobs** resets manual cut/ignore choices and can be undone. You can also delete individual elements or open the CAD editor for larger selections. Undo restores deleted geometry. Editing recalculates length, holes, area and weight; changed jobs need review again.
3. Set each job's material, thickness and quantity; batch editing is available. Include/exclude jobs or combine disconnected paths that belong to one part.
4. Enable **With material** to add a per-kg price. Weight, cutting length and starts can have explicit per-piece overrides.
5. Review included jobs and units, then prepare the customer quotation. Choose visible columns and sections, customer details, title, number, date and notes. Office details can be added later in Rates & settings.
6. Download the PDF/CSV, share the quotation, or export individual job DXFs in a desktop ZIP.

Filenames follow `16mm ms 1nos.dxf`, with collisions numbered `16mm ms 1nos 1.dxf`, `16mm ms 1nos 2.dxf`, and so on. The ZIP includes a CSV manifest. Manual pricing overrides do not change geometry.

## Correct detection in the preview

- **Select**: click a line to highlight it in orange. Shift-click adds/removes elements. **Delete selected** (or Delete on the focused preview) removes the selection; clicking alone never deletes. **Ignore selected** excludes geometry without deleting it. Undo retains the previous geometry and pricing inputs.
- **Box job**: drag around a whole part and its holes, then click **Make job**. Only fully enclosed curves are selected. Recognised formatting is omitted by default. Enable **Include ignored geometry in box selection** before dragging to recover intentionally ignored shapes. Select one source drawing when multiple files overlap.
- A manual job persists through recalculation, saving and backup restore. It replaces the affected detected jobs; remaining geometry from a split job is ignored so former holes do not become extra charged parts. Multiple disconnected profiles can deliberately be grouped as one job.
- **Use only manual jobs in this drawing** excludes all remaining automatic geometry after you have boxed the jobs you need. Undo reverses it. **Re-detect jobs** resets manual membership and cut/ignore choices for automatic extraction again.
- Sheet/FORMAT/title/reference metadata is excluded before nesting. A rectangle around multiple detailed parts can be recognised as a sheet frame. Ambiguous rectangles show **Highlight frame** and **Ignore this frame** actions instead of assuming every rectangle is formatting. Normal rectangular parts with holes are retained.
- Open geometry needs the explicit **Allow open cutting paths** choice. Invalid intersections still block quotation. Breaking an existing outline is flagged for repair or an explicit ignore/cut decision.

## Confirmed pricing

Length is **millimetres**, as specified:

```text
Per-piece cutting = length mm × thickness mm × material rate
Per-piece piercing = cutting starts × piercing charge
Per-piece material = weight kg × price/kg   (when enabled)
Job total = (cutting + piercing + material) × quantity
```

Default rates: MS 8, SS 16, copper 30, aluminium 25. Below 16 mm the piercing charge is Rs 1/start; at 16 mm and above it is Rs 2/start. Thus 1,000 mm × 10 mm MS × 8 gives Rs 80,000 plus piercings. All rules are editable.

Net weight = area mm² × thickness mm × density kg/m³ / 1,000,000,000. Holes are deducted. To charge stock/scrap, enter a manual per-piece weight; 80 kg × Rs 100/kg adds Rs 8,000 per piece. Cutting, piercing and material amounts round to paise per piece before multiplication by quantity. Setup is added, then discount, then tax.

Changing settings recalculates the current project. Saved quotations retain their original measurement, rate and company snapshots. Re-exporting identical content reuses the quotation; changed content receives an `-R2`, `-R3`, etc. revision.

## 2D CAD tools

**New drawing** starts a blank millimetre drawing; Undo can restore the previous geometry. Import can add supported DXF/DWG geometry. Available tools include:

- Line, polyline, rounded rectangle, circle, three-point arc, ellipse, regular polygon, rounded slot and control-point spline. Plate and flange builders generate exact outlines, holes and bolt patterns from dimensions.
- Coordinates `X,Y`, relative coordinates `@dx,dy`, polar input `length<angle`, and `C` to close a polyline.
- Pan, cursor-centred zoom, fit, grid, endpoint/midpoint/centre/quadrant/intersection snaps, optional nearest snap and ortho. New drawings reset the layer and view to the origin.
- Individual, source-object and connected-contour selection; Shift multi-select; window/crossing selection; quick selection by type or open paths.
- Delete, keep only, move, copy, rotate, mirror, uniform scale and rectangular arrays.
- Trim lines/arcs/circles and ellipses against supported boundaries; extend lines; offset joined straight-sided contours or individual lines/arcs/circles; fillet/chamfer two meeting straight lines. Split lines, arcs, ellipses and rational splines without flattening them.
- Explicit small-gap repair for dangling straight-line endpoints, with undo. This alters geometry and is never performed silently.
- Layer visibility and separate Cut flags. Construction geometry is visible while editing but excluded from costing/export.
- Draggable endpoint/centre/radius/ellipse-axis/control-point grips, plus numeric grip coordinates. Internal copy/paste uses Ctrl+C / Ctrl+V; Ctrl+S exports DXF. Type LINE, CIRCLE, SPLINE, SPLIT, FIT, UNDO or REDO in the command field.
- Distance measurement, 40-step undo/redo including view restoration, automatic local draft saving, DXF export and **Use for costing**.

Ellipses and control-point splines can be drawn, selected, reshaped with grips, split, transformed and exported. This is a practical laser-drawing editor; it does not include every AutoCAD operation. It does not generate machine programs, nesting, kerf compensation, lead-ins or bending toolpaths. CAD drafts are local; export DXF to keep a separate copy.

## Shared factory history and customer sharing

See [SHARED_HISTORY_SETUP.md](SHARED_HISTORY_SETUP.md) for the one-time managed database setup. The schema is in [database/supabase.sql](database/supabase.sql). Configuration is prepared, but no live Supabase project/account is connected in this workspace.

After configuration and factory sign-in, reviewed valid costings save automatically, quotations retain fixed prices, and members see shared history, workflow statuses and team notes. Offline changes queue locally. The centre retrieves the latest 300 cloud records and caches up to 500; older records remain in the database. Original CAD files/geometry remain on their device; shared records contain measurements, customer details and pricing snapshots.

**Share PDF to an app** uses native file sharing when supported. Choose WhatsApp and then your group/customer. The fallback WhatsApp button downloads the PDF and opens a summary; attach the file manually. Email can open a prefilled mail message or download an `.eml` draft with the PDF attached. Mail apps vary in draft handling. The user reviews and sends the message. Opening a share window does not mark a quotation Sent automatically.

Team quotation JSON files support manual transfer/import, including internal rates. Use the configurable PDF for customers.

## CAD coverage and review

Supported planar cut entities: LINE, CIRCLE, ARC, ELLIPSE, LWPOLYLINE, 2D POLYLINE with circular bulges, control-point SPLINE/NURBS with positive rational weights, and nested uniformly scaled/rotated/reflected INSERT blocks/arrays. Curves remain exact DXF entities on export. Line/circle/arc lengths and areas are analytic; ellipse and rational spline lengths/areas use adaptive numerical integration. Preview/topology uses adaptive sampling; analytic curve extrema are included where available. Spline dimensions follow the adaptive samples.

Closed outer contours become jobs, enclosed contours become holes and nested islands become separate parts. Open imported references are withheld from costing. Explicit manual cutting choices or **Restore as cutting** allow intended open cuts to be costed; disconnected cuts can be combined. Each connected contour is initially counted as one piercing/start; actual machine strategies may differ. Exact duplicate curves are removed with a note; differently segmented or nearly coincident geometry is not silently merged. The default 0.01 mm endpoint join tolerance retains measured lengths and reports joined gaps.

Text, dimensions, leaders, attributes and points are treated as annotations. The job detector recognises common borders/title grids, reference/bend lines and groups of outline lettering, including exploded linework. A layer named CUT alone does not override formatting detection. They remain inspectable as grey ignored geometry until deleted. Explicit cutting decisions override automatic detection. Manufacturing intent still needs review. The app cannot infer manufacturing intent from every technical drawing. Unsupported cut entities, invalid splines, non-planar geometry, non-uniform block scales, missing references, branches and detected intersections block quotation until resolved/excluded. Paper-space and unused block content do not inflate the cutting total.

Binary DXF and fit-point-only spline reconstruction are not supported. Hatches, regions, solids, meshes and unsupported content require conversion or deliberate exclusion. DWG uses LibreDWG WebAssembly; coverage varies by drawing version/entity. ASCII DXF is the preferred interchange format.

Limits: 20,000 curves, 1,500 contours, 2,000 instances/block array, 16 nested block levels, eight million topology checks and a 60-second import timer. Very close/tangent contours, unclear drawing intent and machine-specific start counts need review against the CAD/CAM measurements used in the factory.

PDFs currently use Latin fonts and `Rs.` for currency. Use English/Latin quotation text. Company contact fields remain blank until supplied. The sample PDF is a layout example.

## Your eight example DXFs

The supplied files under D:\DXF are read-only inputs. `node scripts/audit-examples.mjs` makes private test copies in ignored `tmp/customer-drawings/` and records an audit. They are never copied into the website or deployment ZIP. Customer regression tests run when those private copies exist and skip on other PCs. See [output/DXF-validation.md](output/DXF-validation.md) for findings.

Tests cover pricing, rational spline measurements and round trips, topology, transforms, editing operations, DXF export, quote snapshot integrity/revisions and sharing files. Live Supabase policies, sign-in and two-device synchronization still require verification against the configured project and real factory accounts.

## Deploy and install

Follow [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) for the GitHub Desktop → private GitHub repository → Vercel setup, future updates, and moving your local projects to the live site.

Vercel/Netlify configuration is included. Build: `npm run build`; output: `dist`; Node: 22.12+ or 24. For automatic history, set the two public environment values described in `.env.example` and the setup guide, then redeploy. Never put a Supabase secret/service-role key in the website.

Connect the repository to Vercel/Netlify, or upload the built contents of `dist/` to Netlify. `output/sachin-cutcost-deploy.zip` contains the static build; the source directory is used for repository-based builds. The site itself needs HTTPS for phone installation.

Android Chrome: three-dot menu → Install app / Add to Home screen. iPhone Safari: Share → Add to Home Screen. Core assets/fonts cache after the first successful online production load. The DWG engine caches after first use, so open a DWG once online before relying on offline imports. Development mode does not register the service worker.

Projects, drafts and settings are local IndexedDB data. Saved-project history retains up to 50 snapshots. Restoring a backup retains existing saved history as well as incoming projects. Older cached analyses are rechecked with the current detector when opened. Backup JSON includes source CAD, settings, projects and costing/quotation records. Download backups; clearing browser storage removes local data. Supabase authentication protects shared factory records; a public static URL itself is not private hosting access control.

Dependencies and licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). DWG support includes GPL-3.0 LibreDWG-Web; upstream sources and build instructions are linked there.
