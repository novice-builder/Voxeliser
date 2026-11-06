# Voxel Lab — standalone 3D voxeliser

A browser-based 3D-to-voxel converter, designed for testing models before importing their voxel grids into Block World. Open `index.html` or visit this repository’s GitHub Pages site. Model files are processed **locally in the browser**; no server upload is required.

## Supported imports

- **OBJ** (MTL colours and UV-mapped image textures), **STL**, **GLB**, **glTF** (with external `.bin` buffers and image textures), **PLY** (ASCII/binary mesh), **OFF**, **DAE/COLLADA** (basic geometry), **3DS** (basic mesh), and **3MF** (basic mesh).
- **ZIP packages**, including nested ZIPs up to 8 levels. The importer searches through archive folders for supported models, lists multiple models for selection, and matches MTLs, image textures and external glTF buffers. You can also import multiple loose files or an entire local folder.
- **Not direct imports:** FBX, native `.blend`/`.max`, USD/USDZ, Unity packages, or proprietary CAD files. Convert these to GLB or OBJ in Blender or another compatible application. For downloads that offer several formats, GLB is generally the easiest choice; choose the smaller texture option if memory is limited.

## Important limitations

- Materials: **base colours plus UV-mapped image textures** are supported for OBJ+MTL (`map_Kd`) and glTF/GLB (`baseColorTexture` and compatible legacy diffuse-texture materials). The original preview uses textures on WebGL-capable browsers, and the voxeliser samples those colours into the voxel grid and JSON exports when the file provides supported material data. Texture sampling is quantised to 5 bits per channel, and images are downsampled to a maximum of 1536 pixels per side. Source previews now use high-precision texture coordinates (important for models with strongly repeated UV textures), render double-sided triangles, and respect glTF BLEND transparency for glazing. The viewer uses a simplified directional-light shader rather than Sketchfab’s full physically based lighting, so metallic reflections, normal maps, and transparent glass may still look different from the original. The importer now handles normalised UV coordinates, `TEXCOORD_1`, `KHR_texture_transform` offsets/rotation/scale, common glTF texture wrapping and `COLOR_0` vertex colours. Advanced shader materials, KTX2/Basis-compressed images, animated textures, normal maps, DAE/3DS image maps, and proprietary formats remain unsupported.
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

## Verified with supplied Sketchfab models

Tested the actual `casa_di_abitazione.glb` and `gabled_house_with_timber_terrace.glb` files (inside their original ZIP packages). Both import successfully, their embedded colour textures are decoded (12 and 8 colour maps respectively), and the voxel exporter produces multi-colour palettes at longest-side resolution 48. Casa uses the `KHR_materials_pbrSpecularGlossiness` extension and strongly repeated UV coordinates. The gabled model contains glass with BLEND opacity and a diffuse texture atlas with some intentionally black areas. The application does not yet duplicate Sketchfab’s complete PBR material renderer, and the exact iOS/WebGL appearance has not been verified.

## Troubleshooting missing colours

If a GLB appears entirely white in **Original**, the problem is likely in model import, shader rendering, or browser memory/texture upload rather than voxel-grid conversion. If the original displays incorrect texture placement, check glTF UV sets and material extensions. These vary between files, and the formats supported above are not a guarantee for every model. For an exact diagnosis, provide the original GLB or a ZIP with its dependencies.

## V6 — corrected glTF texture orientation

- Corrected glTF/GLB vertical UV origin conversion before rendering and voxel colour sampling. GLB/glTF texture coordinates have an upper-left image origin, whereas the internally shared OBJ-style texture sampler expects a lower-left image origin.
- This addresses black/incorrect image-atlas regions appearing on imported house roofs, walls, timber and ground. OBJ texture imports retain their existing orientation.
- Verified using the supplied Gabled House and Casa Di Abitazione ZIP imports. A geometric-area-weighted check of the Gabled House roof changes the incorrectly sampled black/dark area from approximately 42% to 0% of sampled triangles; the ground mapping changes from approximately 99% dark to 25% dark, with the remainder sampling the expected grassy colours.

This is still a lightweight preview renderer; advanced PBR, environment lighting, normal maps and screen-space reflections are not reproduced.


## V7 — GLB material brightness and depth precision

- Decode glTF and legacy specular/glossiness material colour factors from **linear** RGB into display/sRGB values before combining them with textures. This addresses near-black roof materials in Casa Di Abitazione, and improves other dark untextured surfaces such as planting-soil strips in Gabled House. The same palette adjustment applies to voxel JSON exports. OBJ colour values are unchanged.
- Improve perspective depth-buffer accuracy by using a dynamically sized near clipping plane instead of 0.005 metres; this helps reduce mobile Z-fighting where model surfaces nearly overlap. Some genuinely coplanar triangles exist in the source model and can still flicker.
- Re-tested the supplied Casa Di Abitazione and Gabled House ZIPs for import and material preservation. The exact iPhone visual output still needs verification.

## V8 — glass and transparent-surface preview

- Draw opaque source geometry first, then transparent material groups in a separate blended pass without writing to the depth buffer. The small transparent triangle groups are sorted back-to-front for the current camera view.
- Add a **Transparent glass strength** slider in the Original and Overlay preview modes. The slider is deliberately **preview-only**: it does not alter voxel occupancy, materials, or the JSON/OBJ exports.
- For GLB scenes with unusually dark, relatively opaque glazing (including Casa Di Abitazione, whose glass is approximately 69% opaque), the initial strength is 55% of the material's original opacity. Other models, including Gabled House, start at 100% to preserve their existing appearance. A user can manually set the full original opacity or hide transparent surfaces at 0%.
- Both supplied house ZIPs passed browser import and preview-control checks with no JavaScript errors. Automated test browser has no WebGL context, so glass composition must still be verified on a WebGL-capable browser such as iPhone Safari.

**Note:** Better preview transparency is independent of voxel colour assignment. The current grid still selects the first triangle intersecting an unoccupied cell, which can miscolour overlapping roof surfaces; fixing this requires a separate voxelisation update.


## V9 — brighter studio lighting

- **Preview lighting**: Studio (new brighter default), Classic (approximately the prior V8 look), or Unlit (flat texture colours).
- **Preview brightness** slider: 60–200%, default 120% in Studio.
- **Ambient light** slider: 0–120%, default 90% in Studio. Studio retains a gentle directional light, reducing harsh darkening of walls and roof shadows.
- Preview lighting applies to Original, Voxels and Overlay rendering only. **It does not modify source textures, occupied grid data, the voxel-colour palette or exports.**
- Both supplied house ZIPs loaded successfully in automated browser tests, and the new controls changed settings without JavaScript errors. The headless test browser used software preview rather than WebGL, so the final visual result should be checked on Safari/iPhone.
- Sketchfab's image-based lighting, reflections, ambient occlusion and tone mapping are not replicated by this simplified viewer; brightness controls improve the comparison but cannot guarantee an exact match.
