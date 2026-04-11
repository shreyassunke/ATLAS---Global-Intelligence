import * as Cesium from 'cesium';

/**
 * ATLAS Night Shader
 * Photorealistic day/night effect with city lights + atmospheric scattering
 * Call initNightShader(viewer) once after the CesiumJS viewer is initialised.
 */
export function initNightShader(viewer) {
  const scene = viewer.scene;
  const globe = scene.globe;
  const imageryLayers = globe.imageryLayers;

  // 1. Sync clock to real current time (live terminator)
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
  viewer.clock.multiplier = 1;
  viewer.clock.shouldAnimate = true;

  // 2. Enable sun-driven globe lighting
  globe.enableLighting = true;
  globe.dynamicAtmosphereLighting = true;
  globe.dynamicAtmosphereLightingFromSun = true;

  // 3. Atmospheric scattering — sky halo visible from space
  const skyAtmosphere = scene.skyAtmosphere;
  if (skyAtmosphere) {
    skyAtmosphere.show = true;
    skyAtmosphere.rayleighCoefficient = new Cesium.Cartesian3(5.5e-6, 13.0e-6, 28.4e-6);
    skyAtmosphere.rayleighScaleHeight = 10000.0;
    skyAtmosphere.mieCoefficient = new Cesium.Cartesian3(21e-6, 21e-6, 21e-6);
    skyAtmosphere.mieScaleHeight = 3200.0;
    skyAtmosphere.mieAnisotropy = 0.9;
    skyAtmosphere.atmosphereLightIntensity = 20.0;
  }

  // 4. Ground atmosphere — coloured scattering on globe surface
  globe.showGroundAtmosphere = true;
  globe.atmosphereLightIntensity = 20.0;
  globe.atmosphereRayleighCoefficient = new Cesium.Cartesian3(5.5e-6, 13.0e-6, 28.4e-6);
  globe.atmosphereRayleighScaleHeight = 10000.0;
  globe.atmosphereMieCoefficient = new Cesium.Cartesian3(21e-6, 21e-6, 21e-6);
  globe.atmosphereMieScaleHeight = 3200.0;
  globe.atmosphereMieAnisotropy = 0.9;

  // 5. Night fade distances (metres) — controls how quickly darkness falls
  globe.nightFadeOutDistance = 10000000;
  globe.nightFadeInDistance  =  5000000;

  // 6. NASA Black Marble city lights (Cesium ion asset 3812)
  //    dayAlpha=0 hides it in sunlight; nightAlpha=1 shows it in darkness
  const nightLayer = imageryLayers.addImageryProvider(
    new Cesium.IonImageryProvider({ assetId: 3812 })
  );
  nightLayer.dayAlpha   = 0.0;
  nightLayer.nightAlpha = 1.0;
  nightLayer.brightness = 2.0;
  nightLayer.gamma      = 2.2;
  imageryLayers.raiseToTop(nightLayer);

  // 7. Space environment
  scene.sun = new Cesium.Sun();
  scene.sun.show = true;
  scene.backgroundColor = Cesium.Color.BLACK;
  if (scene.skyBox) scene.skyBox.show = true;

  // 8. Re-sync clock every 60s to prevent drift
  const driftInterval = setInterval(() => {
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
  }, 60000);

  // 9. Cleanup helper (call if viewer is ever destroyed)
  function destroy() {
    clearInterval(driftInterval);
  }

  // 10. Return control handles for UI toggles
  return {
    nightLayer,
    destroy,
    setCityLights: (enabled) => { nightLayer.show = enabled; },
    setCityLightBrightness: (value) => { nightLayer.brightness = value; },
    setLighting: (enabled) => {
      globe.enableLighting = enabled;
      globe.dynamicAtmosphereLighting = enabled;
      nightLayer.dayAlpha = enabled ? 0.0 : 1.0;
      viewer.clock.shouldAnimate = enabled;
      if (enabled) viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
    },
    setTime: (date) => {
      viewer.clock.currentTime = Cesium.JulianDate.fromDate(date);
    },
  };
}
