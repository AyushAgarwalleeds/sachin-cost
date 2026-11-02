# Factory DXF detection — version 2.2

The default preview shows cutting jobs only; Show ignored reveals excluded geometry. The calculator separates cutting profiles from sheet formatting before job extraction and intersection checks. Ignored geometry is shown grey and does not enter costing. **Delete ignored items** removes it in one click; **Undo cleanup** restores it. **Inspect ignored items → Restore as cutting** recovers intentional engraving, lettering or open cuts. The original files in D:\DXF remain unchanged.

| File | Automatic result |
| --- | --- |
| PCTM_BKT_02_Lasercut | **5 jobs**, with starts **1, 6, 1, 1, 5**. **4,561** outline-lettering, label-box, border and reference elements excluded. No VIEWPORT or intersection error on the checked file. Total cutting length **4,701.444721 mm** before quantity multiplication. Units are undeclared; confirm mm against a known dimension. |
| Nautical compass | **1 job, 33 starts**. Rational/control-point splines retained. Cutting length **6,424.697851 mm** after converting its declared centimetres to millimetres. |
| Retainer clamp / trailing arm | Sheet border/title grid and open references excluded; **20 closed profiles** recovered. Check that all nested profiles are intended manufacturing parts and set quantities/thickness individually. |
| bending line | **1 outside job, 11 holes, 12 starts**. Six bend/reference/micro elements excluded. Cutting length approximately **2,154.191068 mm**. |
| BMW crash bar clamp | **1 job, two slots, 3 starts**. Three reference lines excluded automatically. Cutting length **356.164616 mm**. |
| impeller LASER CUTTING | Sheet borders/references excluded; **3 closed jobs** remain. Inspect the technical views to confirm which profiles should be included. |
| perfect | **1 job, one hole, 2 starts**, detected automatically. A wire endpoint touches the interior of another line; the 0.038393 mm dangling overrun is excluded. Cutting length **117.917392 mm**, net area **331.953809 mm²**. No endpoint movement or invented closing segment is needed. |
| ROTARY SCREEN (HOSPET) | **1 outside job, 48 holes, 49 starts**. Six reference/bend lines excluded. Cutting length approximately **12,554.208780 mm**. Verify the recovered outside boundary. |

Detection uses entity metadata, outline-lettering groups (including exploded lines), framed annotation regions and closed profile boundaries. PCTM also passes when all entities use the CUT layer. Repeated identical manufactured profiles are protected from being mistaken for lettering. It cannot establish manufacturing intent for every arbitrary technical drawing. All jobs still require geometry/unit review; ignored items can be restored before deletion. Explicit manual cutting choices take priority over automatic detection. A layer named CUT alone does not make formatting chargeable. Re-detect jobs resets manual cut/ignore choices, with Undo available. A normal rectangular part with holes is retained.

The PCTM intersection warning also exposed sub-micron retracing at rounded arc/line junctions. The topology sampling now handles those junctions within tolerance. Original curves, exact cutting lengths, analytic areas, dimension extrema and exported DXF definitions remain unchanged.

Older saved analyses are rechecked automatically when opened. Known annotation warnings such as VIEWPORT are removed by the current reader. Genuine unsupported cut entities continue to block quotation. Backup restore now also retains existing saved-project history.

Regression checks cover the above supplied files, classification coverage, cleanup/re-export invariance, explicit open-cut restoration, dimensions, spline splitting and new CAD primitives. These checks do not replace comparison with your factory CAD/CAM measurements.

Repeat on this PC:

```sh
node scripts/audit-examples.mjs
npm test
```

Private copies/audit data stay under ignored `tmp/`; they are excluded from source and deployment ZIPs.

Version 2.2 recognises unambiguous endpoint-on-edge closures in simple wires. It preserves total source geometry length when splitting an edge, with dangling extensions separately classified. Gaps beyond the configured endpoint tolerance still require a cutting decision; they are not silently filled. Existing cached analyses are refreshed with reader version 4.
