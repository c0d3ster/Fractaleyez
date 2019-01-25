/**
 * Global settings used by the components
 */
export default {

  // If set to true, the components will log the errors to the console
  showerrors: true,

  // If set to true, the components will log informations about their running
  showloginfos: true,

  // The key to be pressed to show / hide HUD - if set to false huf can't be toggled
  hudToggleKey: 'h',

  // If the HUD is displayed or not by default
  hudDisplayed: true,

  // Volume of the audio at the beginning
  volume: 0.5,

  // Speed of particle movement towards you
  speed_DEFAULT: 2,

  speed_MIN: 0,

  speed_MAX: 40,

  speed_STEP_SIZE: 0.5,

  // Speed at which particles rotate
  rotationSpeed_DEFAULT: 2,

  rotationSpeed_MIN: -50,

  rotationSpeed_MAX: 50,

  rotationSpeed_STEP_SIZE: 0.25,

  // Scale at which the camera view content, the higher the value the larger particles will become
  scaleFactor_DEFAULT: 1500,

  scaleFactor_MIN: 100,

  scaleFactor_MAX: 2000,

  scaleFactor_STEP_SIZE: 100,

  // Controls the Sensitivity of the camera movement, higher number allows for more camera movement
  cameraBound_DEFAULT: 100,

  cameraBound_MIN: 0,

  cameraBound_MAX: 500,

  cameraBound_SEP_SIZE: 20

};
