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
  uniform float uOrient;
  uniform float uSpin;
  uniform float uLogZoom;
  uniform float uWStart;
  uniform float uAspect;
  uniform float uHuePhase;
  uniform float uSaturation;
  uniform vec2 uCenterOffset;
  uniform float uIterOffset;
  uniform float uRotation;
  uniform vec2 uKoenigs2;
  uniform vec2 uKoenigs3;
  uniform float uCyclone;
  uniform float uGlow;
  uniform float uShockRadius;
  uniform float uShockStrength;

  varying vec2 vUv;

  const int MAX_ITER = 128;

  vec2 complexMul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }

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
    // The fixed point sits at screen center until the sway offset moves it. Shifting in normalized
    // frame space keeps the zoom loop self-similar.
    vec2 p = (vUv - (vec2(0.5, 0.5) + uCenterOffset)) * vec2(uAspect, 1.0) * 2.0;
    float r = length(p);

    // Shockwave: a ring of lens distortion expanding from the fixed point. It only bends the frame
    // coordinates, so it can't disturb the zoom loop's self-similarity.
    if (uShockStrength > 0.0 && r > 0.0001) {
      float ring = uShockStrength * exp(-pow((r - uShockRadius) / 0.3, 2.0));
      p -= (p / r) * ring * 0.35;
    }

    // Cyclone: a bounded counter-rotating twist that varies with distance from the center.
    // uOrient turns each shape so the direction from the zoom point toward the origin (into the black
    // region) faces down; uSpin is the zoom's own spiral turn, uRotation is the user's Rotation.
    float angle = uOrient + uSpin + uRotation + uCyclone * 0.7 * sin(uRotation) * cos(r * 2.5);
    float ca = cos(angle);
    float sa = sin(angle);
    vec2 rotated = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

    float radius = uWStart * exp(uLogZoom);
    // Inverse Koenigs coordinate to third order, so wider views stay self-similar at the loop wrap.
    vec2 w = rotated * radius;
    vec2 w2 = complexMul(w, w);
    vec2 z0 = uFixedPoint + w + complexMul(uKoenigs2, w2) + complexMul(uKoenigs3, complexMul(w2, w));

    float nu = juliaSmoothIter(z0, uC);

    // Zooming one self-similarity period deeper adds exactly one escape iteration, so without this
    // the palette jumps by (periods * 0.05) of a color cycle at every loop wrap.
    vec3 color = nu < 0.0 ? vec3(0.0) : palette((nu - uIterOffset) * 0.05);

    // Glow: brighten on beats, strongest near the set's edge (points that escape late).
    float edge = nu < 0.0 ? 0.0 : exp(-nu * 0.1);
    color += color * uGlow * (0.3 + 1.0 * edge);

    // Saturation blends between the color's luma (grayscale) and the full palette color.
    color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, uSaturation);

    gl_FragColor = vec4(color, 1.0);
  }
`
