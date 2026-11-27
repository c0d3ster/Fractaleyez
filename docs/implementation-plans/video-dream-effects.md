# Video Layer: DeepDream-Style Effects

## Context

The video layer (`src/visualization/layers/video-layer.ts`) is bare right now: it plays a clip or the camera into its target, and the compositor blends it with the other layers. Its next iteration should give it effects of its own, and the first one is a DeepDream-style look.

DeepDream (Google, 2015) runs a trained image-recognition network backwards: it nudges a picture to strengthen whatever patterns the network half-sees, so faces sprout eyes, snouts and swirls, and feeding the result back in makes the dream grow. Running the real network in the browser is heavy (a few dreams per second at low resolution on a good GPU, a multi-MB model download, too slow for phones). So the decision is to build **DeepDream-style effects as GPU shaders on the video feed**: the melting, swirling, self-feeding trippy feel at full frame rate on every device, reacting to the music. They will not grow the network's eyes and dog faces. The real network stays a possible later experiment (see the end).

Not started.

## The effects

All run in the video layer's own pass, on the video frame before it reaches the compositor, so they never touch the other layers. Each is a few uniforms in one shader, plus a feedback buffer.

- **Feedback dream.** The core of the look. Keep the previous output in a buffer, warp it slightly (zoom in a little, rotate, push along the image's own edges) and blend the new frame over it, so patterns smear outward and build on themselves like a DeepDream video. A Persistence control sets how much of the old dream stays.
- **Edge glow.** Find edges (a Sobel filter) and add them back brightened and tinted from the palette, so outlines of faces and objects start to glow and double.
- **Flow warp.** Bend the image along its own gradients (or along a slowly drifting noise field), which gives the melting, breathing look.
- **Color shift.** Rotate hue by brightness and edge strength, using the shared Color config palette so the video matches the rest of the show.
- **Detail boost.** Sharpen and raise local contrast at a few scales, which brings out the texture that the feedback then amplifies.

## Audio

Like the other layers, it should move with the music. The audio multipliers set the warp strength and the feedback zoom, a beat pulses the edge glow, and Persistence can rise through a buildup so the dream thickens before a drop. Auto mode can turn it on for drops and breaks later.

## Controls

Keep it simple, like the fractal Type picker: one **Dream** switch on the video layer with a single **Intensity** slider that drives all the effects together, and the individual effects (Persistence, Edge glow, Warp, Color shift) in the expanded view for people who want to tune them.

## Fitting the pipeline

- The feedback buffer is one extra render target at the video layer's resolution, allocated only while Dream is on.
- Tie its resolution and the number of effect passes to `QualityProfile`, so Auto quality can scale it down.
- The camera works the same as a clip, since both arrive as the video texture.

## Later: the real network

If the shader version lands well and people ask for the eyes and faces, try the real thing as an opt-in premium effect: TensorFlow.js with InceptionV1 (Apache 2.0 weights), gradient ascent on one layer at about 224 to 384 px a few times per second, blended over the live frame through the same feedback buffer. Load the model only when it is turned on, measure it on a laptop and a phone first, and fall back to the shader version wherever it is too slow.
