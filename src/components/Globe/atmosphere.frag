varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
  vec3 atmosphereColor = vec3(0.3, 0.6, 1.0);
  gl_FragColor = vec4(atmosphereColor, 1.0) * intensity;
}
