# Voxel Lab — standalone 3D voxeliser

A browser-based 3D-to-voxel converter, designed for testing models before importing their voxel grids into Block World. Open `index.html` or visit this repository’s GitHub Pages site. Model files are processed **locally in the browser**; no server upload is required.

## Supported imports

- **OBJ** (MTL colours and UV-mapped image textures), **STL**, **GLB**, **glTF** (with external `.bin` buffers and image textures), **PLY** (ASCII/binary mesh), **OFF**, **DAE/COLLADA** (basic geometry), **3DS** (basic mesh), and **3MF** (basic mesh).
- **ZIP packages**, including nested ZIPs up to 8 levels. The importer searches through archive folders for supported models, lists multiple models for selection, and matches MTLs, image textures and external glTF buffers. You can also import multiple loose files or an entire local folder.
- **Not direct imports:** FBX, native `.blend`/`.max`, USD/USDZ, Unity packages, or proprietary CAD files. Convert these to GLB or OBJ in Blender or another compatible application. For downloads that offer several formats, GLB is generally the easiest choice; choose the smaller texture option if memory is limited.

## Important limitations

- Materials: **base colours plus UV-mapped image textures** are supported for OBJ+MTL (`map_Kd`) and glTF/GLB (`baseColorTexture`). The original preview uses textures on WebGL-capable browsers, and the voxeliser samples those colours into the voxel grid and JSON exports. Texture sampling is quantised to 5 bits per channel, and images are downsampled to a maximum of 1536 pixels per side. Advanced shader materials, texture transforms, animated textures, normal maps, DAE/3DS image maps, and proprietary formats are not yet supported.
- Imported mesh must contain triangles; point clouds without reconstructed faces will not voxelise.
- Model units for OBJ/STL/PLY/DAE/3DS may need manual selection. GLB/glTF use metres; 3MF is converted to metres.
- Shell and solid fill behave best for watertight models. A tiny opening in a mesh can allow the outside-air flood fill into an enclosed space.
- ZIP imports use on-demand extraction, with safety limits of 1 GB cumulative uncompressed entries, 600 MB per entry and 8 nested ZIP levels. These are safety limits, not a guarantee that extremely large models will fit your device’s memory.

## Usage

1. Click **Import model or ZIP package**, **Import whole folder**, or drag files onto the preview.
2. If your ZIP contains more than one model, choose it under **Model in package**.
3. Select units/scale, then set resolution (longest side), voxel size, or axis limits.
4. Set your maximum grid capacity (25–200 million possible positions), choose surface, shell or solid, and click **Voxelise model**. High capacities can exhaust browser memory, especially on phones.
5. Rotate the preview, inspect texture colours and layers, then export voxel-grid JSON or merged OBJ geometry. The 3D viewer stays pinned while you scroll through controls.

## Deployment

This site uses ordinary static HTML/JavaScript and includes an automated deployment workflow at `.github/workflows/pages.yml`. For a newly created repository, open **Settings → Pages** and choose **GitHub Actions** as the deployment source if GitHub has not enabled it automatically. The workflow publishes the site from `main`, with expected address `https://novice-builder.github.io/Voxeliser/`. Check the repository **Actions** tab for deployment success or errors.

## Licence and acknowledgements

The custom voxel engine and importer integration were written as a clean-room implementation for this project, not copied from Drububu's software. [JSZip 3.10.1](https://stuk.github.io/jszip/) is bundled inline for ZIP/3MF importing; JSZip is dual licensed under MIT or GPLv3, and this distribution uses its MIT terms (see `THIRD_PARTY_LICENSES.md`).