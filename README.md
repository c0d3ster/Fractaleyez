# Fractaleyez

Fractaleyez is a new way to visualize your music utilizing the beauty of mathematical fractals on a three.js canvas.
Fractaleyez puts you in control of your musical journey with the arrow keys controlling your speed and rotation and the mouse controlling your path of travel.
The interactive visualizer will run automatically without any music behind it, but it only gets better when your microphone picks up background noise. The microphone audio analysis occurs in real-time allowing the visualizer to respond to the beat of any music in your environment.

## Menu Options

There is a sidebar menu that is hidden by default which can be accessed by hovering your mouse on the left side of your screen and clicking the "menu" tab. This menu can also be expanded into a new window, enabling real-time configuration modifications without taking up the visual space. Currently, the menu is split into two sections outlined below.

### Configuration

The Configuration section of the menu provides users with real-time customization of the visual. The options are split into 5 main categories outlined below. Most options can be adjusted without any disruption of the current visual scene (with the exception of the Particle Config). 

#### User Config

Adjust your travel and perspective in the 3-dimensional visual space. 

#### Audio Config

Adjust how the visual detects "beats" from your microphone.

#### Effects Config

Add a variety of preconfigured effects which adjust how the visuals respond to a "beat". These options can affect individual particles, particle layers, or overlay on the entire visual space.

#### Orbit Config

Adjust variables in the algorithm that generates each "layer" of particles. These variables can be adjusted in real-time to create unique visual progressions.

#### Particle Config

Modify characteristics of each particle and layers of particles. Changing settings in this category will force a re-render of the entire visual space.
*WARNING: Increasing values too much in this category can seriously impact performance and overload your GPU, causing the application to crash*

### Presets

The Preset section of the menu provides users with previously configured visual settings which are aesthetically pleasing, allowing any visitor to hit the ground running with mind-blowing visuals. Eventually, users will be able to create accounts and save their own custom configuration presets for later use.

## Resources Utilized

Audio Visualization Starter Pack by bcrespy: https://github.com/bcrespy/audio-visualization-starter

Barry Martin's Hopalong Orbits Visualizer by Iacopo Sassarini: http://iacopoapps.appspot.com/hopalongwebgl/

## Day to day usage

Maintenance operation can be run using command in `package.json`.
    - `yarn start`|`yarn start-dev` to start prod / dev environment

## Docker integration

Run docker containers \
`docker-compose build && docker-compose up -d && docker-compose exec fractaleyez sh`

Just run day to day commands directly inside `fractaleyez` container.

Access to `localhost:6969` or `localhost:7070` to access prod or dev environment.
