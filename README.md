# Voxel Lab — standalone 3D voxeliser

A browser-based 3D-to-voxel converter, designed for testing models before importing their voxel grids into Block World. Open `index.html` or visit this repository’s GitHub Pages site. Model files are processed **locally in the browser**; no server upload is required.

## Supported imports

- **OBJ** (optional MTL sidecar colours), **STL**, **GLB**, **glTF** (with external `.bin` buffers), **PLY** (ASCII/binary mesh), **OFF**, **DAE/COLLADA** (basic geometry), **3DS** (basic mesh), and **3MF** (basic mesh).
- **ZIP packages**, including nested ZIPs up to 5 levels. The importer searches through archive folders for supported models, lists multiple models for selection, and matches MTLs and external glTF buffers. You can also import multiple loose files or an entire local folder.
- **Not direct imports:** FBX, native `.blend`/`.max`, USD/USDZ, Unity packages, or proprietary CAD files. Convert these to GLB or OBJ in Blender or another compatible application. For downloads that offer several formats, GLB is generally the easiest choice; choose the smaller texture option if memory is limited.

## Important limitations

- Materials: **base material colours** are supported. Photographic / image textures (OBJ `map_Kd`, glTF texture images) are detected but **not yet sampled/baked into voxel colours**. Some model features (animations, rigging, skinning, advanced material definitions, and complex DAE scene transforms) are not supported.
- Imported mesh must contain triangles; point clouds without reconstructed faces will not voxelise.
- Model units for OBJ/STL/PLY/DAE/3DS may need manual selection. GLB/glTF use metres; 3MF is converted to metres.
- Shell and solid fill behave best for watertight models. A tiny opening in a mesh can allow the outside-air flood fill into an enclosed space.
- Safeguards cap extracted ZIP data to 220 MB total / 75 MB per item and limit recursion to 5 ZIP layers. This helps manage memory; it is not a guarantee against very large models or malformed archives.

## Usage

1. Click **Import model or ZIP package**, **Import whole folder**, or drag files onto the preview.
2. If your ZIP contains more than one model, choose it under **Model in package**.
3. Select units/scale, then set resolution (longest side), voxel size, or axis limits.
4. Choose surface, shell, or solid and click **Voxelise model**.
5. Rotate the preview, inspect layers, then export voxel-grid JSON or merged OBJ geometry.

## Deployment

This site uses ordinary static HTML/JavaScript and includes an automated deployment workflow at `.github/workflows/pages.yml`. For a newly created repository, open **Settings → Pages** and choose **GitHub Actions** as the deployment source if GitHub has not enabled it automatically. The workflow publishes the site from `main`, with expected address `https://novice-builder.github.io/Voxeliser/`. Check the repository **Actions** tab for deployment success or errors.

## Licence and acknowledgements

The custom voxel engine and importer integration were written as a clean-room implementation for this project, not copied from Drububu's software. [JSZip 3.10.1](https://stuk.github.io/jszip/) is bundled inline for ZIP/3MF importing; JSZip is dual licensed under MIT or GPLv3, and this distribution uses its MIT terms (see `THIRD_PARTY_LICENSES.md`).