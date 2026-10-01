export const juliaVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const juliaFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 uC;
  uniform vec2 uFixedPoint;
  uniform float uT;
  uniform float uLambdaMag;
  uniform float uLambdaArg;
  uniform float uWStart;
  uniform float uAspect;
  uniform float uHuePhase;

  varying vec2 vUv;

  const int MAX_ITER = 128;

  vec2 complexSquare(vec2 z) {
    return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
  }

  // Continuous/smooth escape-time count. Returns -1.0 for points that never escape (inside the set).
  float juliaSmoothIter(vec2 z, vec2 c) {
    float n = float(MAX_ITER);
    bool escaped = false;

    for (int i = 0; i < MAX_ITER; i++) {
      z = complexSquare(z) + c;
      if (dot(z, z) > 256.0) {
        n = float(i);
        escaped = true;
        break;
      }
    }

    if (!escaped) return -1.0;

    float logZn = log(dot(z, z)) * 0.5;
    return n + 1.0 - log2(logZn);
  }

  vec3 palette(float t) {
    vec3 a = vec3(0.5);
    vec3 b = vec3(0.5);
    vec3 d = vec3(0.0, 0.33, 0.67);
    return a + b * cos(6.28318 * (vec3(t) + d + uHuePhase));
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;

    float angle = -uT * uLambdaArg;
    float ca = cos(angle);
    float sa = sin(angle);
    vec2 rotated = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

    float radius = uWStart * pow(uLambdaMag, -uT);
    vec2 z0 = uFixedPoint + rotated * radius;

    float nu = juliaSmoothIter(z0, uC);

    vec3 color = nu < 0.0 ? vec3(0.0) : palette(nu * 0.05);
    gl_FragColor = vec4(color, 1.0);
  }
`
