# ScaleSketch

ScaleSketch is a standalone, local-first 2D geometry sketching web app. It is intentionally isolated from the BYOD Secure DNS repository.

## What it does

- Draws lines, rectangles, circles, and ellipses on a canonical millimetre model.
- Adds associative aligned, horizontal, vertical, angle, radius, and diameter dimensions. Measurement points use the enabled Snap choices, and dimension labels can be dragged without changing the measured geometry.
- Snaps to endpoints, midpoints, centres, quadrants, edges, intersections, grid, horizontal/vertical axes, and perpendicular feet.
- Constructs perpendicular, tangent, secant, and chord lines. Tangent, chord, and secant relations update when their circle changes.
- Supports exact X/Y entry, numeric property editing, pan/zoom, undo/redo, and keyboard shortcuts.
- Autosaves locally and imports/exports JSON. SVG and PNG exports include dimensions; SVG includes a physical verification bar.
- Adapts to narrow screens while keeping exact-coordinate entry accessible.

## Run locally

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:4175`.

To use another port:

```powershell
npm.cmd run dev -- 4176
```

## Verify

```powershell
npm.cmd run check
npm.cmd test
```

The drawing model uses real-world units independently from screen pixels and zoom.

Browser QA scripts are in `tests/browser-*.js` and cover core workflows, circle constructions, import/export, responsive accessibility, and a 1,000-object performance sample. They are intended to be run with Playwright CLI against a local preview.

## Publish with GitHub Pages

This repository is prepared to publish its static site automatically. The Pages artifact is the tracked `dist/` folder; its asset paths are relative, so it works whether the repository is named `scalesketch` or something else.

1. Create an empty repository on GitHub, then push this workspace to its `main` branch.
2. In the GitHub repository, open **Settings** → **Pages** and choose **GitHub Actions** as the source.
3. Open the **Actions** tab and wait for the **Deploy GitHub Pages** workflow to finish. You can also choose **Run workflow** there to deploy manually.
4. GitHub will show the published address in the workflow summary. For a project site it normally has this form: `https://<account>.github.io/<repository>/`.

Every push to `main` first checks the two JavaScript files for syntax errors and then deploys `dist/`. The workflow is defined in `.github/workflows/deploy-pages.yml`; it does not require a local build step or package installation.

### First push

After selecting the GitHub repository address, run the following from this folder (replace the placeholder with the repository URL):

```powershell
git add .
git commit -m "Initial ScaleSketch GitHub Pages site"
git branch -M main
git remote add origin https://github.com/<account>/<repository>.git
git push -u origin main
```

## Scope

This version is a precise 2D estimator and simple geometry drafting tool. It is not a CAD replacement: it does not provide layers, arbitrary Bézier paths, angle constraints, collaborative editing, or print-driver calibration. SVG includes a verification bar so physical output can be checked after printing.

Project files live in this standalone workspace and do not modify the BYOD Secure DNS repository.
