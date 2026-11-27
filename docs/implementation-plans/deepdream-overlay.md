# DeepDream Overlay

## Context

DeepDream (Google, 2015) runs a trained image-recognition network backwards. Instead of naming what is in a picture, it nudges the picture to strengthen whatever patterns one of the network's layers already half-sees, so faces sprout eyes, snouts and swirls, and feeding the result back in makes the dream grow. It is the trippy look people remember from early AI images and videos, and it would suit the video and camera layer, where the faces are. This plan is for trying it as an overlay effect. Not started.

## Two ways to get the look

- **Real DeepDream.** Run the network (InceptionV1/GoogLeNet, as the original used; Apache 2.0 weights) in the browser with TensorFlow.js on WebGL or WebGPU, and do gradient ascent on the frame: each step is a forward and a backward pass that raises one layer's activations. This is the only way to get the actual eyes and dog faces.
- **DeepDream-style shader.** A plain GPU effect: edge boosting, feedback zoom, swirl and color shifts. Runs at full frame rate on any device and gives the melting, trippy feel, but not the eyes and faces, which come from the trained network.

The plan is to prototype the real one first, and keep the shader as the fallback for devices that cannot run it.

## Making it real time enough

A full dream is many passes per frame, so it cannot keep up with 60fps. The usual way around it is also how the classic DeepDream videos were made:

- **Dream slowly, show smoothly.** Run the network at low resolution (around 224 to 384 px) a few times per second, off the main render, and blend each dreamed result over the live frame with a fade.
- **Feedback.** Dream on the previous dreamed frame mixed with the new video frame, so the dream builds up over time instead of starting over every frame. How much of the old dream stays is a knob.
- **Audio reactive.** The music sets how hard it dreams (the step size and how many steps), which layer it amplifies (low layers give swirls and textures, deeper ones give eyes and animals), or how much of the old dream stays.

## Open questions and risks

- **Speed.** Measure frames per dream on a typical laptop GPU and a phone. If a phone cannot dream at a few frames per second, the effect is desktop only, with the shader on phones.
- **Download size.** The model weights are several MB. Load them only when the effect is first turned on, show progress, and cache them.
- **Placement.** Either an effect in the Effects category applied to the composited frame, or an option on the video layer only. Faces are on the video and camera layer, and limiting it there also keeps the cost down.
- **Quality tiers.** Tie the dream resolution and dreams per second to `QualityProfile`, and let Auto quality drop the effect to the shader version when it struggles.
- **Plan.** Probably a premium effect, given its cost and its novelty.

## Prototype steps

1. TensorFlow.js with InceptionV1, gradient ascent on one layer, run on a still image in a test page. Check that the look is right.
2. Time it at a few resolutions and step counts on desktop and mobile.
3. Wire it to the video layer as a feedback dream blended over the live frame, at whatever rate step 2 allows.
4. Add the audio mapping and an on or off control, then decide on placement and quality tiers from how it feels.
