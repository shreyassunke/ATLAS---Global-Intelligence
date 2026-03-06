# Space background — NASA SVS Deep Star Maps 2020

The globe uses the **NASA SVS Deep Star Maps 2020** as the only space background (no Cesium default).

- **Official page:** https://svs.gsfc.nasa.gov/4851#media_group_319116  
- **Asset:** 1.7B stars from Hipparcos-2, Tycho-2, Gaia DR2

The app tries to load the image from NASA’s server first. If that fails (e.g. CORS), it falls back to a local file.

**To use a local copy:**  
Download **starmap_2020_4k_print.jpg** (1024×512) from the [NASA SVS 4851 Downloads](https://svs.gsfc.nasa.gov/4851#media_group_319116) and place it in this folder:

```
public/starfield/starmap_2020_4k_print.jpg
```

Then the skybox will use this file instead of the remote URL.
